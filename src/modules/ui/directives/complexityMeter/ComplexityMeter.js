(function () {
    'use strict';

    /**
     * @param Base
     * @param {JQuery} $element
     * @param {*} $scope
     * @param {app.utils} utils
     * @param {app.i18n} i18n
     * @return {ComplexityMeter}
     */
    const controller = function (Base, $element, $scope, utils, i18n) {

        class ComplexityMeter extends Base {

            get value() {
                return this.$input.val();
            }

            get valid() {
                return this._form && this._form[this.field] && this._form[this.field].$valid || false;
            }

            constructor() {
                super();
                /**
                 * @type {JQuery}
                 */
                this.$input = null;
                /**
                 * @type {string}
                 */
                this.field = null;
                /**
                 * @type {Array}
                 */
                this.steps = [];
                /**
                 * @type {string}
                 */
                this.helpText = null;
                /**
                 * @type {boolean}
                 */
                this.touched = false;
                /**
                 * @private
                 */
                this._form = null;

                this._addSteps();
                window.c = this;
            }

            $postLink() {
                const form = $element.closest('form');
                this._form = $scope.$parent.$eval(form.attr('name'));
                this.$input = form.find(`input[name="${this.field}"]`);

                this.$input.on('input', () => this._onChangeValue());

                this.receive(utils.observe(this._form[this.field], '$viewValue'), this._onChangeValue, this);
                this.receive(utils.observe(this._form[this.field], '$valid'), this._onChangeValue, this);

                this._onChangeValue();
            }

            _onChangeValue() {
                const value = this.value;
                const complexity = this._getComplexy([
                    this._getLengthComplexy(value),
                    this._getComplexyByReg(value, /[A-Z]/g, 30),
                    this._getComplexyByReg(value, /[a-z]/g, 30),
                    this._getComplexyByReg(value, /[0-9]/g, 30),
                    this._getComplexyByReg(value, /\W/g, 20)
                ]);
                this._activateSteps(Math.round(complexity / 10));
            }

            _activateSteps(activeStep) {
                activeStep = this.valid ? Math.max(activeStep, 3) : Math.min(activeStep, 2);
                for (let i = 0; i < this.steps.length; i++) {
                    this.steps[i].active = i < activeStep;
                }
                if (activeStep <= 2) {
                    const minLength = (Number(this.$input.attr('min-length')) || 8);
                    this.state = 'not-secure';
                    this.helpText = i18n.translate('createAccount.inputHelpError', 'app.create', { minLength });
                } else if (activeStep < 7) {
                    this.state = 'warn';
                    this.helpText = i18n.translate('createAccount.inputHelpWarn', 'app.create');
                } else {
                    this.state = 'success';
                }
            }

            _getComplexy(complexityList) {
                return (complexityList.reduce((result, item) => result + item) / complexityList.length) * 100;
            }

            _getLengthComplexy(value) {
                const minLength = (Number(this.$input.attr('min-length')) || 8);
                const targetLength = Math.round(minLength * 1.8);
                const complexity = Math.min(value.length / targetLength, 1);
                return value.length < minLength ? complexity / 2 : complexity;
            }

            _getComplexyByReg(value, reg, targetScore) {
                const parts = value.match(reg);
                if (!parts) {
                    return 0;
                }
                let score = 0;
                const charHash = Object.create(null);
                parts.forEach((char) => {
                    if (charHash[char]) {
                        score += 2;
                    } else {
                        score += 10;
                        charHash[char] = char;
                    }
                });
                return Math.min(score / targetScore, 1);
            }

            /**
             * @private
             */
            _addSteps() {
                for (let i = 0; i < 10; i++) {
                    this.steps.push({ active: false });
                }
            }

        }

        return new ComplexityMeter();
    };

    controller.$inject = ['Base', '$element', '$scope', 'utils', 'i18n'];

    angular.module('app.ui').component('wComplexityMeter', {
        bindings: {
            field: '@'
        },
        templateUrl: 'modules/ui/directives/complexityMeter/complexityMeter.html',
        transclude: false,
        controller
    });
})();
