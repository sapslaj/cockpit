/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

(function() {
    "use strict";

    var VOLUME_FACTORY_SUFFIX = "VolumeFields";

    angular.module('kubernetes.storage', [
        'ngRoute',
        'kubeClient',
        'kubernetes.listing',
        'ui.cockpit',
    ])

    .config([
        '$routeProvider',
        function($routeProvider) {
            $routeProvider
                .when('/storage', {
                    templateUrl: 'views/pv-listing.html',
                    controller: 'StorageCtrl'
                })

                .when('/storage/:target', {
                    controller: 'StorageCtrl',
                    templateUrl: 'views/pv-page.html'
                });
        }
    ])

    /*
     * The controller for the storage view.
     */
    .controller('StorageCtrl', [
        '$scope',
        'kubeLoader',
        'kubeSelect',
        'ListingState',
        'filterService',
        '$routeParams',
        '$location',
        'storageActions',
        '$timeout',
        function($scope, loader, select,  ListingState, filterService,
                 $routeParams, $location, actions, $timeout) {
            var target = $routeParams["target"] || "";
            $scope.target = target;

            var c = loader.listen(function() {
                var timer;
                $scope.pvs = select().kind("PersistentVolume");
                if (target)
                    $scope.item = select().kind("PersistentVolume").name(target).one();
            });

            loader.watch("PersistentVolume");
            loader.watch("PersistentVolumeClaim");

            $scope.$on("$destroy", function() {
                c.cancel();
            });

            $scope.listing = new ListingState($scope);

            /* All the actions available on the $scope */
            angular.extend($scope, actions);

            /* Redirect after a delete */
            $scope.deletePV= function(item) {
                var promise = actions.deletePV(item);

                /* If the promise is successful, redirect to another page */
                promise.then(function() {
                    if ($scope.target)
                        $location.path($scope.viewUrl('storage'));
                });

                return promise;
            };

            $scope.$on("activate", function(ev, id) {
                if (!$scope.listing.expandable) {
                    ev.preventDefault();
                    $location.path('/storage/' + id);
                }
            });
        }
    ])

    .directive('pvPanel',
        function() {
            return {
                restrict: 'A',
                link: function(scope, element, attrs) {
                    var tab = 'main';
                    scope.tab = function(name, ev) {
                        if (ev) {
                            tab = name;
                            ev.stopPropagation();
                        }
                        return tab === name;
                    };
                },
                templateUrl: 'views/pv-panel.html'
            };
        }
    )

    .directive('pvBody',
        function() {
            return {
                restrict: 'A',
                templateUrl: 'views/pv-body.html'
            };
        }
    )

    .directive('pvcBody',
        function() {
            return {
                restrict: 'A',
                templateUrl: 'views/pvc-body.html',
                scope: {
                      item: '=item',
                      settings: '=settings'
                },
            };
        }
    )

    .directive('pvClaim', [
        'storageData',
        'kubeLoader',
        function(storageData, loader) {
            return {
                restrict: 'A',
                templateUrl: 'views/pv-claim.html',
                link: function(scope, element, attrs) {
                    var c = loader.listen(function() {
                        scope.pvc = storageData.claimForVolume(scope.item);
                        scope.pods = storageData.podsForClaim(scope.pvc);
                    });

                    loader.watch("PersistentVolume");
                    loader.watch("PersistentVolumeClaim");
                    loader.watch("Pod");

                    scope.$on("$destroy", function() {
                        c.cancel();
                    });
                },
            };
        }
    ])

    .directive('volumeBody',
        function() {
            return {
                restrict: 'A',
                templateUrl: 'views/volume-body.html',
                scope: {
                      volume: '=volume'
                },
            };
        }
    )

    .factory("storageData", [
        'kubeSelect',
        "KubeTranslate",
        "KubeMapNamedArray",
        function (select, translate, mapNamedArray) {
            var _ = translate.gettext;

            var KNOWN_VOLUME_TYPES = {
                "gcePersistentDisk" : _("GCE Persistent Disk"),
                "awsElasticBlockStore" : _("AWS Elastic Block Store"),
                "gitRepo" : _("Git Repository"),
                "secret" : _("Secret"),
                "emptyDir" : _("Empty Directory"),
                "hostPath" : _("Host Path"),
                "glusterfs" : _("Gluster FS"),
                "nfs" : _("NFS Mount"),
                "rbd" : _("Rados Block Device"),
                "iscsi" : _("ISCSI"),
                "cinder" : _("Cinder"),
                "cephfs" : _("Ceph Filesystem Mount"),
                "fc" : _("Fibre Channel"),
                "flocker" : _("Flocker"),
                "flexVolume" : _("Flex"),
                "azureFile" : _("Azure")
            };

            var ACCESS_MODES = {
                "ReadWriteOnce" : _("Read Write Once"),
                "ReadOnlyMany" : _("Read Only"),
                "ReadWriteMany" : _("Read and Write"),
            };

            var RECLAIM_POLICIES = {
                "Retain" : _("Retain"),
                "Recycle" : _("Recycle")
            };

            select.register({
                name: "volumeName",
                digest: function(arg) {
                    if (typeof arg === "string")
                        return arg;

                    var spec = arg.spec || {};
                    return spec.volumeName;
                }
            });

            select.register({
                name: "claim",
                digests: function(arg) {
                    if (typeof arg === "string")
                        return ["claimName="+arg];

                    var i, ret = [];
                    var spec = arg.spec || {};
                    var vols = spec.volumes || [];
                    for (i in vols) {
                        var claim = vols[i].persistentVolumeClaim || {};
                        if (claim.claimName)
                            ret.push("claimName=" + claim.claimName);
                    }
                    return ret;
                }
            });

            function getVolumeType(volume) {
                var keys = Object.keys(KNOWN_VOLUME_TYPES);
                var i;
                volume = volume || {};
                for (i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    if (volume[key])
                        return key;
                }
            }

            function getVolumeLabel(volume) {
                var type = getVolumeType(volume);
                if (type)
                    return KNOWN_VOLUME_TYPES[type];
                return _("Unknown");
            }

            function claimForVolume(volume) {
                var uid = "";
                if (volume && volume.spec.claimRef)
                    uid = volume.spec.claimRef.uid || "";

                return select().kind("PersistentVolumeClaim").uid(uid).one();
            }

            function claimFromVolumeSource(source, namespace) {
                source = source || {};
                return select().kind("PersistentVolumeClaim").namespace(namespace || "")
                               .name(source.claimName || "").one();
            }

            function podsForClaim(claim) {
                var meta;
                claim = claim || {};
                meta = claim.metadata || {};
                return select().kind("Pod").namespace(meta.namespace || "")
                               .claim(meta.name || "");
            }

            function volumesForPod(item) {
                var volumes, mounts;
                var i, j, container, volumeMounts, name;
                if (item && !item.volumes) {
                    if (item.spec)
                        volumes = mapNamedArray(item.spec.volumes);
                    else
                        volumes = { };

                    if (item.spec && item.spec.containers) {
                        for (i = 0; i < item.spec.containers.length; i++) {
                            container = item.spec.containers[i];
                            volumeMounts = container.volumeMounts || [];
                            for (j = 0; j < volumeMounts.length; j++) {
                                name = volumeMounts[j].name;
                                if (!volumes[name])
                                    volumes[name] = {};

                                if (!volumes[name]['mounts'])
                                    volumes[name]['mounts'] = {};

                                volumes[name]['mounts'][container.name] = volumeMounts[j];
                            }
                        }
                    }

                    item.volumes = volumes;
                }
                return item ? item.volumes : { };
            }

            return {
                podsForClaim: podsForClaim,
                volumesForPod: volumesForPod,
                claimFromVolumeSource: claimFromVolumeSource,
                claimForVolume: claimForVolume,
                getVolumeType: getVolumeType,
                getVolumeLabel: getVolumeLabel,
                reclaimPolicies: RECLAIM_POLICIES,
                accessModes: ACCESS_MODES,
            };
        }
    ])

    .factory('storageActions', [
        '$modal',
        '$injector',
        'storageData',
        function($modal, $injector, storageData) {

            function canEdit(item) {
                var spec = item ? item.spec : {};
                var type = storageData.getVolumeType(spec);
                if (type)
                    return $injector.has(type + VOLUME_FACTORY_SUFFIX);
                return true;
            }

            function deletePV(item) {
                return $modal.open({
                    animation: false,
                    controller: 'PVDeleteCtrl',
                    templateUrl: 'views/pv-delete.html',
                    resolve: {
                        dialogData: function() {
                            return { item: item };
                        }
                    },
                }).result;
            }

            function createPV(item) {
                return $modal.open({
                    animation: false,
                    controller: 'PVModifyCtrl',
                    templateUrl: 'views/pv-modify.html',
                    resolve: {
                        dialogData: function() {
                            return { };
                        }
                    },
                }).result;
            }

            function modifyPV(item) {
                return $modal.open({
                    animation: false,
                    controller: 'PVModifyCtrl',
                    templateUrl: 'views/pv-modify.html',
                    resolve: {
                        dialogData: function() {
                            return { item: item };
                        }
                    },
                }).result;
            }

            return {
                modifyPV: modifyPV,
                createPV: createPV,
                deletePV: deletePV,
                canEdit: canEdit,
            };
        }
    ])

    .factory("defaultVolumeFields", [
        "storageData",
        "KubeStringToBytes",
        "KubeTranslate",
        "KUBE_NAME_RE",
        function (storageData, stringToBytes, translate, NAME_RE) {
            var _ = translate.gettext;
            function build (item) {
                if (!item) {
                    return {
                        policy: "Retain"
                    };
                }

                var spec = item.spec || {};
                var fields = {
                    "capacity" : spec.capacity ? spec.capacity.storage : "",
                    "policy" : spec.persistentVolumeReclaimPolicy
                };

                var i;
                for (i in item.spec.accessModes || []) {
                    fields[item.spec.accessModes[i]] = true;
                }

                return fields;
            }

            function validate (item, fields) {
                var ex, spec, name, capacity, policy, i, validModes, accessModes = [];
                var ret = {
                    errors: [],
                    data: null,
                };

                validModes = Object.keys(storageData.accessModes);
                for (i = 0; i < validModes.length; i++) {
                    var mode = validModes[i];
                    if (fields[mode])
                        accessModes.push(mode);
                }

                if (accessModes.length < 1) {
                    ex = new Error(_("Please select a valid access mode"));
                    ex.target = "#last-access";
                    ret.errors.push(ex);
                    ex = null;
                }

                name = fields.name ? fields.name.trim() : fields.name;
                if (!item && (!name || !NAME_RE.test(name))) {
                    ex = new Error(_("Please provide a valid name"));
                    ex.target = "#modify-name";
                    ret.errors.push(ex);
                    ex = null;
                }

                capacity = fields.capacity ? fields.capacity.trim() : fields.capacity;
                if (!item && (!capacity || !stringToBytes(capacity))) {
                    ex = new Error(_("Please provide a valid storage capacity."));
                    ex.target = "#modify-capacity";
                    ret.errors.push(ex);
                    ex = null;
                }

                policy = fields.policy ? fields.policy.trim() : fields.policy;
                if (!storageData.reclaimPolicies[policy]) {
                    ex = new Error(_("Please select a valid policy option."));
                    ex.target = "#last-policy";
                    ret.errors.push(ex);
                    ex = null;
                }

                if (ret.errors.length < 1) {
                    spec = {
                        "accessModes" : accessModes,
                        "capacity" : { "storage" : capacity },
                        "persistentVolumeReclaimPolicy" : policy,
                    };

                    if (item) {
                        ret.data = {
                            spec: spec
                        };
                    } else {
                        ret.data = {
                            kind: "PersistentVolume",
                            metadata: {
                                name: fields.name.trim()
                            },
                            spec: spec
                        };
                    }
                }

                return ret;
            }

            return {
                build: build,
                validate: validate,
            };
        }
    ])

    .factory("nfs"+VOLUME_FACTORY_SUFFIX, [
        "KubeTranslate",
        function (translate) {
            var _ = translate.gettext;
            function build(item) {
                if (!item)
                    return;

                var spec = item.spec || {};
                var nfs = spec.nfs || {};
                return {
                    server: nfs.server,
                    path: nfs.path,
                    readOnly: nfs.readOnly
                };
            }

            function validate (item, fields) {
                var regex = /^[a-z0-9.-]+$/i;

                var data, ex, server, path;
                var ret = {
                    errors: [],
                    data: null,
                };

                server = fields.server ? fields.server.trim() : fields.server;
                if (!server || !regex.test(server)) {
                    ex = new Error(_("Please provide a valid NFS server"));
                    ex.target = "#nfs-modify-server";
                    ret.errors.push(ex);
                    ex = null;
                }

                path = fields.path ? fields.path.trim() : fields.path;
                if (!path || path.search("/") !== 0) {
                    ex = new Error(_("Please provide a valid path"));
                    ex.target = "#modify-path";
                    ret.errors.push(ex);
                    ex = null;
                }

                if (ret.errors.length < 1) {
                    ret.data = {
                        server: server,
                        path: path,
                        readOnly: !!fields.readOnly
                    };
                }

                return ret;
            }

            return {
                build: build,
                validate: validate,
            };
        }
    ])

    .factory("hostPath"+VOLUME_FACTORY_SUFFIX, [
        "KubeTranslate",
        function (translate) {
            var _ = translate.gettext;

            function build(item) {
                if (!item)
                    return;

                var spec = item.spec || {};
                var hp = spec.hostPath || {};
                return {
                    path: hp.path,
                };
            }

            function validate (item, fields) {
                var regex = /^[a-z0-9.-]+$/i;

                var ex, path;
                var ret = {
                    errors: [],
                    data: null,
                };

                path = fields.path ? fields.path.trim() : fields.path;
                if (!path || path.search("/") !== 0) {
                    ex = new Error(_("Please provide a valid path"));
                    ex.target = "#modify-path";
                    ret.errors.push(ex);
                    ex = null;
                }

                if (ret.errors.length < 1) {
                    ret.data = {
                        path: path,
                    };
                }

                return ret;
            }

            return {
                build: build,
                validate: validate,
            };
        }
    ])

    .controller("PVDeleteCtrl", [
        "$scope",
        "$modalInstance",
        "dialogData",
        "kubeMethods",
        function($scope, $instance, dialogData, methods) {
            angular.extend($scope, dialogData);

            $scope.performDelete = function performDelete() {
                return methods.delete($scope.item);
            };
        }
    ])

    .controller("PVModifyCtrl", [
        "$q",
        "$scope",
        "$injector",
        "$modalInstance",
        "dialogData",
        "storageData",
        "defaultVolumeFields",
        "kubeMethods",
        "KubeTranslate",
        function($q, $scope, $injector, $instance, dialogData, storageData,
                 defaultVolumeFields, methods, translate) {
            var _ = translate.gettext;
            var volumeFields, valName;

            angular.extend($scope, dialogData);
            $scope.fields = defaultVolumeFields.build($scope.item);
            $scope.reclaimPolicies = storageData.reclaimPolicies;
            $scope.accessModes = storageData.accessModes;

            $scope.types = [
                {
                    name: _("NFS"),
                    type: "nfs",
                },
                {
                    name: _("Host Path"),
                    type: "hostPath",
                },
            ];

            if ($scope.item) {
                $scope.current_type = storageData.getVolumeType($scope.item.spec);
                valName = $scope.current_type+VOLUME_FACTORY_SUFFIX;
                if ($injector.has(valName)) {
                    volumeFields = $injector.get(valName, "PVModifyCtrl");
                    angular.extend($scope.fields, volumeFields.build($scope.item));
                } else {
                    $scope.$applyAsync(function () {
                        $scope.$dismiss();
                    });
                    return;
                }
            } else {
                $scope.selected = $scope.types[0];
                $scope.current_type = $scope.types[0].type;
            }

            function validate() {
                var defer = $q.defer();
                var ex, resp, main_resp, spec, errors = [];

                if (!$scope.item) {
                    valName = $scope.current_type+VOLUME_FACTORY_SUFFIX;
                    if ($injector.has(valName))
                        volumeFields = $injector.get(valName, "PVModifyCtrl");
                    else
                        errors.push(new Error(_("Sorry, I don't know how to modify this volume")));
                }

                if (volumeFields) {
                    resp = volumeFields.validate($scope.item, $scope.fields);
                    errors = resp.errors;
                }

                main_resp = defaultVolumeFields.validate($scope.item, $scope.fields);
                errors = errors.concat(main_resp.errors);

                if (errors.length > 0) {
                    defer.reject(errors);
                } else {
                    main_resp.data.spec[$scope.current_type] = resp ? resp.data : null;
                    defer.resolve(main_resp.data);
                }

                return defer.promise;
            }

            $scope.needsReadOnly = function() {
                return $scope.current_type !== "flocker" && $scope.current_type !== "hostPath";
            };

            $scope.select = function(type) {
                $scope.selected = type;
                $scope.current_type = type.type;
            };

            $scope.performModify = function performModify() {
                return validate().then(function(data) {
                    if (!$scope.item)
                        return methods.create(data, null);
                    else
                        return methods.patch($scope.item, data);
                });
            };
        }
    ])

    .filter("formatReadOnly", [
        "KubeTranslate",
        function(translate) {
            return function(readOnly) {
                if (readOnly)
                    return translate.gettext("Yes");
                else
                    return translate.gettext("No");
            };
        }
    ])

    .filter("formatPartitionNumber", [
        function() {
            return function(partition) {
                if (!partition)
                    return 0;
                else
                    return partition;
            };
        }
    ])

    .filter("formatVolumeType", [
        'storageData',
        function(storageData) {
            return function(volume) {
                return storageData.getVolumeLabel(volume || {});
            };
        }
    ])

    .filter("reclaimLabel", [
        'storageData',
        function(storageData) {
            return function(policy) {
                var label = storageData.reclaimPolicies[policy || ""];
                return label ? label : policy;
            };
        }
    ])

    .filter("accessModeLabel", [
        'storageData',
        function(storageData) {
            return function(mode) {
                var label = storageData.accessModes[mode || ""];
                return label ? label : mode;
            };
        }
    ]);
}());
