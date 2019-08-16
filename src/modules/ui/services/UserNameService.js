(function () {
    'use strict';

    /**
     * @param Base
     * @param {User} user
     * @return {UserNameService}
     * @param {app.utils} utils
     */

    const factory = function (Base, user, utils) {

        class UserNameService extends Base {

            /**
             * @public
             * @type {string}
             */
            name;
            /**
             * @public
             * @type {string}
             */
            defaultName;
            /**
             * @public
             * @type {string}
             */
            address;


            constructor(base) {
                super(base);

                this.MAX_USER_NAME_LENGTH = 24;

                user.loginSignal.on(() => {
                    this.name = user.name;
                    this.address = user.address;
                    this._setDefaultName();
                });

                user.logoutSignal.on(() => {
                    this.name = '';
                    this.address = '';
                });

                this.receive(utils.observe(user, 'name'), function () {
                    this.name = user.name;
                }, this);

            }

            /**
             * @public
             */
            save() {
                if (!this.name) {
                    this.setName(this.defaultName);
                }

                return this.isUniqueName().then(isUniqueName => {
                    const isNameValid = isUniqueName && this._isNameLengthValid();
                    if (isNameValid) {
                        user.name = this.name;
                    } else {
                        this.name = user.name;
                    }
                });
            }

            /**
             * @public
             * @param {string}
             */
            setName(name) {
                this.name = name;
            }

            /**
             * @public
             * @return {boolean}
             */
            isUniqueName() {
                return this._getUserList().then(list => {
                    const isUnique = list
                        .filter(user => user.address !== this.address)
                        .every(user => user.name !== this.name);
                    return !this.name || isUnique;
                });
            }

            /**
             * @return {boolean}
             * @private
             */
            _isNameLengthValid() {
                return this.name ? this.name.length <= this.MAX_USER_NAME_LENGTH : true;
            }

            /**
             * @return {null}
             * @private
             */
            _setDefaultName() {
                const defaultNameRegexp = /^Account(\s\d*)?$/;

                if (defaultNameRegexp.test(this.name)) {
                    this.defaultName = this.name;
                    return null;
                }

                user.getDefaultUserName().then(name => {
                    this.defaultName = name;
                });
            }

            _getUserList() {
                return user.getFilteredUserList();
            }

        }

        return new UserNameService();
    };

    factory.$inject = ['Base', 'user', 'utils'];

    angular.module('app.ui').factory('userNameService', factory);
})();
