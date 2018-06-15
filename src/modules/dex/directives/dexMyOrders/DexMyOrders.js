(function () {
    'use strict';

    const entities = require('@waves/data-entities');

    /**
     * @param Base
     * @param {Waves} waves
     * @param {User} user
     * @param {IPollCreate} createPoll
     * @param {INotification} notification
     * @param {app.utils} utils
     * @param {$rootScope.Scope} $scope
     * @param orderStatuses
     * @return {DexMyOrders}
     */
    const controller = function (
        Base,
        waves,
        user,
        createPoll,
        notification,
        utils,
        $scope
    ) {

        const R = require('ramda');
        const tsUtils = require('ts-utils');

        class DexMyOrders extends Base {

            constructor() {
                super();

                /**
                 * @type {{amount: string, price: string}}
                 * @private
                 */
                this._assetIdPair = null;

                /**
                 * @type {Array}
                 */
                this.orders = null;
                /**
                 * @type {boolean}
                 */
                this.pending = true;
                /**
                 * @type {Object.<string, boolean>}
                 */
                this.shownOrderDetails = Object.create(null);

                this.syncSettings({
                    _assetIdPair: 'dex.assetIdPair'
                });

                this.headers = [
                    {
                        id: 'pair',
                        valuePath: 'item.pair',
                        search: true
                    },
                    {
                        id: 'type',
                        title: { literal: 'directives.myOrders.type' },
                        valuePath: 'item.type',
                        sort: true
                    },
                    {
                        id: 'time',
                        title: { literal: 'directives.myOrders.time' },
                        valuePath: 'item.timestamp',
                        sort: true,
                        sortActive: true,
                        isAsc: false
                    },
                    {
                        id: 'price',
                        title: { literal: 'directives.myOrders.price' },
                        valuePath: 'item.price',
                        sort: true
                    },
                    {
                        id: 'amount',
                        title: { literal: 'directives.myOrders.amount' },
                        valuePath: 'item.amount',
                        sort: true
                    },
                    {
                        id: 'total',
                        title: { literal: 'directives.myOrders.total' },
                        valuePath: 'item.total',
                        sort: true
                    },
                    {
                        id: 'fee',
                        title: { literal: 'directives.myOrders.tableTitle.fee' },
                        valuePath: 'item.userFee',
                        sort: true
                    },
                    {
                        id: 'status',
                        title: { literal: 'directives.myOrders.status' },
                        valuePath: 'item.progress',
                        sort: true
                    },
                    {
                        id: 'controls',
                        templatePath: 'modules/dex/directives/dexMyOrders/header-control-cell.html',
                        scopeData: {
                            cancelAllOrders: this.cancelAllOrders.bind(this)
                        }
                    }
                ];

                this.statusMap = {
                    Cancelled: 'matcher.orders.statuses.canceled',
                    Accepted: 'matcher.orders.statuses.opened',
                    Filled: 'matcher.orders.statuses.filled',
                    PartiallyFilled: 'matcher.orders.statuses.filled'
                };

                const poll = createPoll(this, this._getOrders, 'orders', 1000, { $scope });

                poll.ready.then(() => {
                    this.pending = false;
                });
            }

            /**
             * @param {IOrder} order
             */
            setPair(order) {
                user.setSetting('dex.assetIdPair', {
                    amount: order.assetPair.amountAsset.id,
                    price: order.assetPair.priceAsset.id
                });
            }

            showDetails(order) {
                this.shownOrderDetails[order.id] = true;
            }

            hideDetails(order) {
                this.shownOrderDetails[order.id] = false;
            }

            toggleDetails(order) {
                this.shownOrderDetails[order.id] = !this.shownOrderDetails[order.id];
            }

            cancelAllOrders() {
                this.orders.filter(tsUtils.contains({ isActive: true })).forEach((order) => {
                    this.dropOrder(order);
                });
            }

            /**
             * @param order
             */
            dropOrder(order) {
                return ds.cancelOrder(order.amount.asset.id, order.price.asset.id, order.id)
                    .then(() => {
                        const canceledOrder = tsUtils.find(this.orders, { id: order.id });
                        canceledOrder.state = 'Canceled';
                        notification.info({
                            ns: 'app.dex',
                            title: { literal: 'directives.myOrders.notifications.isCanceled' }
                        });

                        $scope.$digest();
                    })
                    .catch(() => {
                        notification.error({
                            ns: 'app.dex',
                            title: { literal: 'directives.myOrders.notifications.somethingWentWrong' }
                        });
                    });
            }

            /**
             * @returns {Promise}
             * @private
             */
            _getOrders() {
                return waves.matcher.getOrders()
                    .then((orders) => {
                        const filter = R.filter(R.whereEq({ isActive: true }));
                        const remap = R.map(DexMyOrders._remapOrders);

                        const result = R.pipe(filter, remap)(orders);
                        const last = result.length ? result[result.length - 1] : null;

                        if (!last) {
                            return orders;
                        }

                        return ds.api.transactions.getExchangeTxList({
                            sender: user.address,
                            timeStart: last.timestamp
                        }).then((txList) => {
                            const transactionsByOrderHash = DexMyOrders._getTransactionsByOrderIdHash(txList);
                            return result.map((order) => {
                                if (!transactionsByOrderHash[order.id]) {
                                    transactionsByOrderHash[order.id] = [];
                                }
                                if (transactionsByOrderHash[order.id].length) {
                                    order.fee = transactionsByOrderHash[order.id]
                                        .map(DexMyOrders._getFeeByType(order.type))
                                        .reduce((sum, fee) => sum.add(fee));
                                }
                                order.exchange = transactionsByOrderHash[order.id];
                                return order;
                            });
                        });
                    });
            }

            static _getTransactionsByOrderIdHash(txList) {
                const uniqueList = R.uniqBy(R.prop('id'), txList);
                const transactionsByOrderHash = Object.create(null);
                uniqueList.forEach((tx) => {
                    ['order1', 'order2'].forEach((orderFieldName) => {
                        if (!transactionsByOrderHash[tx[orderFieldName].id]) {
                            transactionsByOrderHash[tx[orderFieldName].id] = [];
                        }
                        transactionsByOrderHash[tx[orderFieldName].id].push(DexMyOrders._remapTx(tx));
                    });
                });
                return transactionsByOrderHash;
            }

            static _remapTx(tx) {
                const fee = (tx, order) => order.orderType === 'sell' ? tx.sellMatcherFee : tx.buyMatcherFee;
                const emptyFee = new entities.Money(0, tx.fee.asset);
                const userFee = [tx.order1, tx.order2]
                    .filter((order) => order.sender === user.address)
                    .reduce((acc, order) => acc.add(fee(tx, order)), emptyFee);

                return { ...tx, userFee };
            }

            /**
             * @param {IOrder} order
             * @private
             */
            static _remapOrders(order) {
                const assetPair = order.assetPair;
                const pair = `${assetPair.amountAsset.displayName} / ${assetPair.priceAsset.displayName}`;
                const isNew = Date.now() < (order.timestamp.getTime() + 1000 * 30);
                const percent = new BigNumber(order.progress * 100).dp(2).toFixed();
                return { ...order, isNew, percent, pair };
            }

            static _getFeeByType(type) {
                return function (tx) {
                    switch (type) {
                        case 'buy':
                            return tx.buyMatcherFee;
                        case 'sell':
                            return tx.sellMatcherFee;
                        default:
                            throw new Error('Wrong order type!');
                    }
                };
            }

        }

        return new DexMyOrders();
    };

    controller.$inject = [
        'Base',
        'waves',
        'user',
        'createPoll',
        'notification',
        'utils',
        '$scope'
    ];

    angular.module('app.dex').component('wDexMyOrders', {
        bindings: {},
        templateUrl: 'modules/dex/directives/dexMyOrders/myOrders.html',
        controller
    });
})();
