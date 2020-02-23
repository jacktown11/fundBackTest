new Vue({
    el: '#app',
    data: {
        reInvestCount: 30,
        inflow: 1000,
        funds: [
            {
                id: 'hs300',
                name: '沪深300',
                dir: './hs300.json',
                isActive: false
            }, {
                id: 'zz500',
                name: '中证500',
                dir: './zz500.json',
                isActive: true
            }, {
                id: '800yy',
                name: '800医药',
                dir: './800yy.json',
                isActive: false
            }, {
                id: '300yy',
                name: '300医药',
                dir: './300yy.json',
                isActive: false
            },{
                id: '300xf',
                name: '300消费',
                dir: './300xf.json',
                isActive: false
            }, {
                id: 'zzxf',
                name: '中证消费',
                dir: './zzxf.json',
                isActive: false
            }
        ],
        buyStrategies: [{
            name: '宽区间估值百分位',
            id: 'VALUATION_PERCENT_WIDE',
            isActive: false
        }, {
            name: '窄区间估值百分位',
            id: 'VALUATION_PERCENT_NARROW',
            isActive: false
        }, {
            name: '宽区间价格百分比',
            id: 'PRICE_PERCENT_WIDE',
            isActive: false
        }, {
            name: '窄区间价格百分比',
            id: 'PRICE_PERCENT_NARROW',
            isActive: false
        }, {
            name: '定额',
            id: 'ALWAYS',
            isActive: true
        }],
        sellStrategies: [{
            name: '年化收益率止盈',
            id: 'YEAR_INC_RATIO',
            isActive: false,
            paramRange: [0.05, 0.25]
        }, {
            name: '简单收益率止盈',
            id: 'SIMPLE_INC_RATIO',
            isActive: true,
            paramRange: [1.1, 2]
        }],
        backTestResult: [],
        isCalculationg: false
    },
    methods: {
        updateBuyStrategies(index) {
            let item = { ...this.buyStrategies[index] };
            item.isActive = !item.isActive;
            this.$set(this.buyStrategies, index, item);
        },
        updateSellStrategies(index) {
            let item = { ...this.sellStrategies[index] };
            item.isActive = !item.isActive;
            this.$set(this.sellStrategies, index, item);
        },
        updateFunds(index) {
            let item = { ...this.funds[index] };
            item.isActive = !item.isActive;
            this.$set(this.funds, index, item);
        },
        backTest() {
            this.isCalculationg = true;
            this.backTestResult = [];

            let { reInvestCount, inflow } = this.param;
            let funds = this.param.funds.concat();

            // 加载所有需要的数据完成后再回测
            let loadData = function (cb) {
                if (funds.length > 0) {
                    DataCenter.loadData(funds[0], () => {
                        funds.shift();
                        loadData(cb);
                    });
                } else {
                    cb();
                }
            };

            // 具体回测过程
            loadData(() => {
                let backTestResult = [];
                this.param.funds.forEach(item => {
                    let fund = item;
                    this.param.buyStrategies.forEach(item => {
                        let buyStrategy = item;

                        this.param.sellStrategies.forEach(item => {
                            let sellStrategy = item;

                            // 在指定指数、买入策略、止盈策略下，计算各种止盈具体参数的收益
                            let result = [];
                            let r = sellStrategy.paramRange;
                            let testCount = 10;
                            let gap = (r[1] - r[0]) / (testCount - 1);
                            for (let param = r[0]; testCount > 0; testCount-- , param += gap) {
                                let res = Trader.trade(fund.id, {
                                    inflow,
                                    reInvestCount,
                                    stragety: {
                                        buy: buyStrategy,
                                        sell: {
                                            id: sellStrategy.id,
                                            param
                                        }
                                    }
                                });
                                result.push(Object.assign({
                                    param
                                }, res));
                            }

                            // 结果汇总
                            backTestResult.push({
                                fund: Object.assign({}, fund),
                                buyStrategy: Object.assign({}, buyStrategy),
                                sellStrategy: Object.assign({}, sellStrategy),
                                result,
                                average: (()=>{
                                    let sum = 0;
                                    for(let i = 0; i < result.length; i++){
                                        sum += result[i].yearIncRatio;
                                    }
                                    return sum/result.length;
                                })()
                            });
                            
                        });
                    })
                });
                this.backTestResult = backTestResult;
            });
        }
    },
    computed: {
        param() {
            // 根据用户选择的策略组合等构成的参数
            return {
                reInvestCount: this.reInvestCount,
                inflow: this.inflow,
                funds: this.funds.filter(item => item.isActive).concat(),
                buyStrategies: this.buyStrategies.filter(item => item.isActive).concat(),
                sellStrategies: this.sellStrategies.filter(item => item.isActive).concat()
            };
        }
    }
});