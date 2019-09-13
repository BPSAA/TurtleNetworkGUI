(function () {
    'use strict';

    function controller() {

        class Controller {

            constructor() {
                this.mobileTab = 'Charts';
                this.mobileOrdersTab = 'myOpenOrders';
                this.mobileHistoryTab = 'orderBook';
            }

            setHovered() {
                this.isHovered = true;
            }

            setNotHovered() {
                this.isHovered = false;
            }

        }

        return new Controller();
    }

    angular.module('app.dex')
        .component('wMobileLayout', {
            templateUrl: 'modules/dex/directives/mobileLayout/mobileLayout.html',
            controller
        });
})();
