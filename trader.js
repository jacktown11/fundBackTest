const SELL_STG = {
    YEAR_INC_RATIO: 'YEAR_INC_RATIO',
    SIMPLE_INC_RATIO: 'SIMPLE_INC_RATIO'
};
const BUY_STG = {
    VALUATION_PERCENT_WIDE: 'VALUATION_PERCENT_WIDE',
    VALUATION_PERCENT_NARROW: 'VALUATION_PERCENT_NARROW',
    PRICE_PERCENT_WIDE: 'PRICE_PERCENT_WIDE',
    PRICE_PERCENT_NARROW: 'PRICE_PERCENT_NARROW',
    ALWAYS: 'ALWAYS'
};
const Strageties = {
    buy: [{
        id: BUY_STG.VALUATION_PERCENT_WIDE,
        func: function (status, param) {
            let p = status.valuationPercent;
            return p < 0.7 ? -2 * p + 15 / 7 : 0;
        }
    }, {
        id: BUY_STG.VALUATION_PERCENT_NARROW,
        func: function (status, param) {
            let p = status.valuationPercent;
            return p < 0.5 ? -2 * p + 2.5 : 0
        }
    }, {
        id: BUY_STG.PRICE_PERCENT_WIDE,
        func: function (status, param) {
            let p = status.pricePercent;
            return p < 0.7 ? -2 * p + 15 / 7 : 0;
        }
    }, {
        id: BUY_STG.PRICE_PERCENT_NARROW,
        func: function (status, param) {
            let p = status.pricePercent;
            return p < 0.5 ? -2 * p + 2.5 : 0;
        }
    }, {
        id: BUY_STG.ALWAYS,
        func: function (status, param) {
            return status.hasInflow ? 1 : 0;
        }
    }],
    sell: [{
        id: SELL_STG.YEAR_INC_RATIO, // 年化收益率
        func: function (status, param) {
            return status.yearIncRatio >= param ? 1 : 0;
        }
    }, {
        id: SELL_STG.SIMPLE_INC_RATIO, // 简单市值倍数
        func: function (status, param) {
            if (status.inMarketValue <= 0) {
                return 0;
            } else {
                let totalInflowFinance = status.account.inMarket.map(buyRecord => buyRecord[5]).reduce((prev, cur) => prev + cur);
                return status.inMarketValue / totalInflowFinance > param ? 1 : 0;
            }
        }
    }],
    getBuyStrategyById: function (id) {
        return this.buy.find(val => val.id === id);
    },
    getSellStrategyById: function (id) {
        return this.sell.find(val => val.id === id);
    }
};

const DataCenter = {
    funds: [
        // {
        //     id: 'zz500',
        //     name: '中证500',
        //     dir: './data.json',
        //     data: [], // 每一个元素都是数组，依次为文本日期，点数，估值，估值百分位，价格百分比
        //     length: 0
        // }
    ],
    loadData: (fundInfo, cb) => {
        let funds = DataCenter.funds;

        let fund = funds.find(fund => fund.id === fundInfo.id);
        if (fund) {
            cb(fund);
        } else {
            let newFund = {
                id: fundInfo.id,
                name: fundInfo.name,
                dir: fundInfo.dir,
                data: [],
                length: 0
            };
            fetch(newFund.dir).then(resp => {
                return resp.json();
            }).then(data => {
                // 数据整理
                newFund.data = data.reverse();
                newFund.length = newFund.data.length;
                let maxPrice = newFund.data[0][1];
                newFund.data.forEach(today => {
                    maxPrice = Math.max(today[1], maxPrice);
                    today[1] = +today[1];
                    today[2] = +today[2];
                    today[3] = +today[3];
                    today[4] = +((today[1] / maxPrice).toFixed(4));
                });
                DataCenter.funds.push(newFund);
                cb(newFund);
            })
        }

    },
    getData: id => {
        let data = DataCenter.funds;
        for (let i = 0; i < data.length; i++) {
            let di = data[i];
            // 存在相应名字的数据
            if (di.id === id) {
                return di;
            }
        }
        return null;
    }
};

let Trader = {
    account: {
        fundId: '',
        pool: [],
        inflow: 1000,
        inflowCount: 0,
        reInvestCount: 20,
        inMarket: [], // 每一个元素是个数组：[时间，点数，估值，估值百分位，价格百分比，金额]
        index: 0, // 当前交易日在历史行情数据数组中的索引值
        soldTimes: 0,
        soldRecord: []
    },
    init: (fundId, param) => {
        Trader.account = {
            fundId: fundId,
            pool: [],
            inflow: param.inflow,
            inflowCount: 0,
            reInvestCount: param.reInvestCount,
            inMarket: [],
            index: 0,
            soldTimes: 0,
            soldRecord: []
        }
    },
    trade: (fundId, param) => {
        Trader.init(fundId, param);

        DataCenter.getData(fundId).data.forEach((val, index) => {
            let account = Trader.account;
            account.index = index;
            let decision = Trader.judgeToday(account.index, param.stragety);
            Trader.takeAction(decision, val);
        });

        return Trader.analyseWholeInvestment();
    },
    getCurrentValue: () => {
        let pool = Trader.account.pool;
        moneyInPool = pool.length > 0 ? pool.reduce((prev, cur) => prev + cur) : 0;
        return moneyInPool + Trader.getInMarketValue();
    },
    getInMarketValue: () => {
        let data = DataCenter.getData(Trader.account.fundId).data;
        let inMarketValue = 0;
        Trader.account.inMarket.forEach((val, index) => {
            inMarketValue += val[5] * data[Trader.account.index][1] / val[1];
        });
        return inMarketValue;
    },
    judgeToday: (index, stragety) => {
        // 整理当日行情状态
        let account = Trader.account;
        let data = DataCenter.getData(account.fundId);
        let dataToday = data.data[index];
        let dataYestody = index > 0 ? data.data[index - 1] : null;
        let inMarketValue = Trader.getInMarketValue();

        let status = {
            account,
            index,
            inMarketValue,
            investTimes: account.inMarket.length, // 还未卖出的场内资金笔数
            yearIncRatio: account.inMarket.length > 0 ? Tool.xirr(account.inMarket.map(buyRecord => buyRecord[5]), inMarketValue) : 0,
            valuationPercent: dataToday[3], // 估值参数百分位
            pricePercent: dataToday[4], // 相对历史最高价百分比
            hasInflow: dataYestody === null || +(dataYestody[0].split('/')[1]) < +(dataToday[0].split('/')[1]) //每月月初才有定投资金流入
        };

        if (status.hasInflow > 0) account.inflowCount++;

        // 根据行情状态，做出投资决定
        let decision = {
            hasInflow: status.hasInflow,
            sellRate: 0, // 卖出比例
            buyRecord: 0 // 买入比例
        };
        let { sell, buy } = stragety;
        decision.sellRate = Strageties.getSellStrategyById(sell.id).func(status, sell.param);
        decision.buyRate = Strageties.getBuyStrategyById(buy.id).func(status, buy.param);
        return decision;
    },
    takeAction: (decision, dataToday) => {
        let account = Trader.account;
        if (account.pool.length === 0) {
            account.pool = new Array(account.reInvestCount);
            account.pool.fill(0);
        }
        if (decision.sellRate > 0) {
            // 止盈
            account.soldTimes++;

            // 止盈资金进入资金池
            let outMoney = Trader.getInMarketValue() * decision.sellRate + decision.hasInflow * account.inflow;
            outMoney = +(outMoney.toFixed(2));
            account.pool.forEach((val, index, arr) => {
                arr[index] += outMoney / account.reInvestCount;
            });
            let newSoldRecord = dataToday.concat();
            newSoldRecord.push(outMoney);
            account.soldRecord.push(newSoldRecord);

            // 更新场内资金信息
            if (decision.sellRate === 1) {
                account.inMarket = [];
            } else {
                account.inMarket.forEach(buyRecord => {
                    buyRecord[5] *= (1 - decision.sellRate);
                });
            }
        } else if (decision.hasInflow > 0) {
            // 未达到止盈条件，同时又是定投日
            if (decision.buyRate > 0) {
                // 到达买入条件，买入
                let buyNum = (account.pool[0] + account.inflow) * decision.buyRate;
                let availableMoney = account.pool.reduce((prev, cur) => prev + cur) + account.inflow;
                if (availableMoney > buyNum) {
                    account.pool.push(0);
                    account.pool.forEach((val, index, arr) => {
                        arr[index] += (account.pool[0] + account.inflow - buyNum) / account.reInvestCount;
                    });
                    account.pool.shift();
                } else {
                    buyNum = availableMoney;
                    account.pool.fill(0);
                }

                // 更新场内资金信息
                let newBuyRecord = dataToday.concat();
                newBuyRecord.push(buyNum);
                account.inMarket.push(newBuyRecord);
            } else {
                // 未达到买入条件，流入资金进入定投池
                account.pool.forEach((val, index, arr) => {
                    arr[index] += account.inflow / account.reInvestCount;
                });
            }
        }
    },
    analyseWholeInvestment: () => {
        let account = Trader.account;
        let capitalInflow = account.inflow * account.inflowCount;
        let capitalEnd = Trader.getCurrentValue();
        let simpleIncRatio = capitalEnd / capitalInflow - 1;
        let capitalInflowArr = new Array(account.inflowCount);
        capitalInflowArr.fill(account.inflow);
        let yearIncRatio = Math.pow((1 + Tool.xirr(capitalInflowArr, capitalEnd)), 12) - 1;
        return {
            capitalInflow,
            capitalEnd,
            simpleIncRatio,
            yearIncRatio,
            soldTimes: account.soldTimes,
            soldRecord: account.soldRecord
        };
    }
};

let Tool = {
    /**
     * 计算内部收益率
     * @param {Array} inputArr 各期期初流入值，正值
     * @param {number} out 最后一期期末流出值，正值 
     * @param {number} exact 精度，默认0.000001
     * @param {number} maxTimes 最大迭代次数，超过后不再迭代，默认1000
     */
    xirr: (inputArr, out, exact = 0.000001, maxTimes = 1000) => {
        let f = x => (inputArr.reduce((pre, cur) => pre * x + cur)) * x - out;
        let deta, r;
        let lowR = 0,
            highR = out / inputArr.reduce((pre, cur) => pre + cur) - 1,
            times = 0;

        do {
            r = (lowR + highR) / 2;
            deta = f(r + 1);
            deta > 0 ? highR = r : lowR = r;
            times++;
        } while (times <= maxTimes && Math.abs(deta) > exact);

        return r;
    }

}
