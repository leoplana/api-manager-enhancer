var getCommonHeaders = function () {
	return {
		"accept": "application/json",
		"content-type": "application/json",
		"accept-language": "en-US",
		"cache-control": "max-age=0",
		"if-modified-since": "Mon, 26 Jul 1997 05:00:00 GMT",
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-site",
		"x-session-data": zupme.sso.lib.getSessionData()
	}
};

var getApis = function () {
	return fetch("https://api-manager-saas.api.zup.me/apis", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
};

var getLatestApiPackages = function (api) {
	var requests = api.versions.map(v => fetch("https://api-manager-saas.api.zup.me/api_versions/" + v.id + "/packages?page=1&per_page=1", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(resp => resp.json()));

	return Promise.all(requests)
		.then(allPackages => ({ api: api, apiPackages: allPackages.filter(p => Array.isArray(p.packages) && p.packages.length > 0).map(p => ({ apiVersion: api.versions.find(v => v.id === p.packages[0]['api_version']).path, latest: p.packages[0] })) }));
};

var fetchAllApiPackages = function (apis) {
	var requests = apis.map(a => getLatestApiPackages(a));
	return Promise.all(requests);
};

var exportPackageJson = function (pkg) {
	return fetch("https://api-manager-saas.api.zup.me/packages/" + pkg.latest.id + "?export=true", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
}

var exportApiAllPackagesJson = function (api) {
	var requests = api.apiPackages.map(apiPkg => exportPackageJson(apiPkg));
	return Promise.all(requests).then(allPackages => ({
		api: api, exports: allPackages
	}));
}

var exportAllApis = function (apis) {
	var requests = apis.map(api => exportApiAllPackagesJson(api));
	return Promise.all(requests);
};

var snakeToCamel = function (input) {
	return angular.element(document.body).injector().get('eeHttpCaseConverterUtils').convertKeyCase.snakeToCamel(input);
};

//LOGS methods

var createLogFilter = function (apiVersionId, entrypointId) {

	var today = moment();
	var thirtyDaysAgo = moment().subtract(30, 'days');

	return getFormattedFilters(
		{
			startDate: thirtyDaysAgo,
			endDate: today,
			apiVersionId: apiVersionId,
			entrypointId: entrypointId
		}, 1, "5m");
};

var getApiLogs = function (api, entrypoints) {

	var requestsParameters = [];
	api.versions.forEach(v => entrypoints.forEach(e => requestsParameters.push({ apiVersion: v, entrypoint: e })));

	var requests = requestsParameters.map(r => fetch("https://analytics-api-aws.api.zup.me/logs/search", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"body": JSON.stringify(createLogFilter(r.apiVersion.id, r.entrypoint.id)),
		"method": "POST",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json().then(json => (
		{
			version: r.apiVersion.path.replace("/", ""),
			environment: r.entrypoint.name,
			logs: {
				total: json.hits.total,
				mostRecentCallAt: json.hits.hits[0] ? json.hits.hits[0]['_source']['@timestamp'] : undefined
			},
			detailedLog: json
		}
	))));

	return Promise.all(requests)
		.then(apiLogs => ({ api: api, summary: apiLogs, detailedLogs: apiLogs.flatMap(logs => logs.detailedLog) }));

};

var getAllApiLogs = function (apis, entrypoints) {
	var requests = apis.map(api => getApiLogs(api, entrypoints));
	return Promise.all(requests);
};

var downloadApiLogs = function () {

	var entrypoints = [{ id: 183, name: "dev" },
	{ id: 184, name: "qa" },
	{ id: 185, name: "prod" }];

	$(".full-page-loading").addClass("show");
	getApis().then(function (apis) {
		getAllApiLogs(apis, entrypoints).then(function (allApisWithLogs) {
			downloadAsExcel(allApisWithLogs, entrypoints);
			$(".full-page-loading").removeClass("show");
		});
	});


	var downloadAsExcel = function (allApisWithLogs, entrypoints) {

		var wb = XLSX.utils.book_new();
		wb.Props = {
			Title: "Relatório",
			Subject: "Relatório de logs",
			Author: "API Manager",
			CreatedDate: new Date()
		};

		var envColumns = entrypoints
			.map(e => [
				'Total chamadas ' + e.name.toUpperCase(),
				'Chamada mais recente ' + e.name.toUpperCase()
			]
			).flat();

		var reportHeader = ['API', 'Versão'].concat(envColumns);

		var rowsByApi = allApisWithLogs.map(function (apiLog) {

			var rows = [];
			var callsByVersion = _.groupBy(apiLog.summary, 'version');
			var versions = Object.keys(callsByVersion).sort();

			for (var i = 0; i < versions.length; ++i) {
				var currentVersion = versions[i];
				var columns = [];
				columns[0] = apiLog.api.name;
				columns[1] = currentVersion;

				var envColumn = 2;
				for (var x in entrypoints) {
					var envData = callsByVersion[currentVersion].find(v => v.environment === entrypoints[x].name);
					columns[envColumn++] = envData && envData.logs ? envData.logs.total : 0;
					columns[envColumn++] = envData && envData.logs ? envData.logs.mostRecentCallAt : '';
				}
				rows.push(columns);
			}
			return rows;
		});

		var reportSheetName = "Relatorio_" + moment().format("DD-MM-YYYY");
		wb.SheetNames.push(reportSheetName);

		var ws_data = [reportHeader].concat(rowsByApi.flat());
		var ws = XLSX.utils.aoa_to_sheet(ws_data);
		wb.Sheets[reportSheetName] = ws;
		var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
		function s2ab(s) {
			var buf = new ArrayBuffer(s.length);
			var view = new Uint8Array(buf);
			for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
			return buf;
		}
		saveAs(new Blob([s2ab(wbout)], { type: "application/octet-stream" }), 'RelatorioLogs.xlsx');
	};

}

//LOGS methods

var downloadExport = function () {
	$(".full-page-loading").addClass("show");
	getApis().then(function (apis) {
		fetchAllApiPackages(apis).then(function (completeApis) {
			exportAllApis(completeApis).then(function (downloadedPkgs) {
				$(".full-page-loading").removeClass("show");
				var zip = new JSZip();
				for (var x in downloadedPkgs) {
					var folder = zip.folder(downloadedPkgs[x].api.api.name);
					for (var y in downloadedPkgs[x].exports) {
						var content = downloadedPkgs[x].exports[y];
						var filename = content["content"]["api_version"]["path"].replace("/", "") + ".json";
						var filecontent = JSON.stringify(snakeToCamel(content), null, "\t");
						folder.file(filename, filecontent);
					}
				}
				zip.generateAsync({ type: "blob" })
					.then(function (content) {
						saveAs(content, "Migracao.zip");
					});
			});
		});
	});
}

//Endpoint group export

var getEndpointGroups = function () {
	return fetch("https://api-manager-saas.api.zup.me/end_point_groups?with_end_points=true", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
};

var getDetailedEndpointGroup = function (endpointGroupId) {
	return fetch("https://api-manager-saas.api.zup.me/end_point_groups/" + endpointGroupId, {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
}

var appendEndpointGroupDeployMatrix = function (endpointGroup) {
	return fetch("https://api-manager-saas.api.zup.me/end_point_groups/" + endpointGroup.id + "/deployment_matrix", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json().then(function (deployMatrix) { endpointGroup.deployMatrix = deployMatrix; return endpointGroup; }));
}

var getAllEndpointGroups = function () {
	return getEndpointGroups().then(
		endpointGroups => Promise.all(endpointGroups.map(e => getDetailedEndpointGroup(e.id)))
	).then(
		endpointGroups => Promise.all(endpointGroups.map(e => appendEndpointGroupDeployMatrix(e)))
	);
}

var downloadEndpointGroupExcelReport = function () {
	$(".full-page-loading").addClass("show");
	getAllEndpointGroups().then(function (groups) {

		var reportHeader = ['Grupo de Endpoint', 'Ambiente', 'Url', 'Virtual Host', 'Variáveis', 'APIs em uso'];

		var rows = groups.map(
			e => e.end_points.map(
				env => [e.name,
				env.end_point_environment.name,
				env.url,
				env.virtual_host,
				env.context_attributes ? Object.keys(env.context_attributes).map(k => k + "=" + env.context_attributes[k].value.content).join(";\n") : '',
				_.uniq(e.deployMatrix.filter(d => d.end_point_environment.name === env.end_point_environment.name).map(d => d.api.name + ' - ' + d.api.path.replace('/', ''))).join(";\n")
				]
			)
		).flat();

		var reportConfig = { title: "RelatorioEndpointGroups", fileName: "Relatorio_EndpointGroups" };

		exportAsExcel(reportHeader, rows, reportConfig);
		saveAs(new Blob([JSON.stringify(snakeToCamel(groups), null, "\t")], {type: "application/json"}), "EndpointGroups.json");
		$(".full-page-loading").removeClass("show");
	});



}

//Applications export



//Current application

var getApplicationById = function (appId) {
	return getDetailedApp(appId).then(
		app => appendAppPermisions(app)
	).then(function(app) {
		var permissions = app.permissions.permissions;
		return app;
		
	});
}

var getCurrentApplication = function() {
	
	var currentApp = document.URL.replace(/(.*\/application\/)(\d+)(.*)/, "$2");
	if(!isNaN(currentApp)) {
		return getApplicationById(currentApp).then(
			app => {

				var apiVersionIds = _.keys(app.permissions.versions);
				var apiResourcesPromises = [];
				apiVersionIds.forEach(id => {
					apiResourcesPromises.push(getApiVersionResources(id));
				});

				var methodSpecificPermissions = app.permissions.permissions.filter(p => p["resource_method_id"] != null);
				var resourceSpecificPermissions = app.permissions.permissions.filter(p => p["resource_id"] != null);
				var apiSpecificPermissions = app.permissions.permissions.filter(p => p["api_version_id"] != null);

				if(apiResourcesPromises.length > 0) {
					return Promise.all(apiResourcesPromises).then(function(resources) {
						var allResources = resources.flat();
						
						var apiSpecificDetailedPermissions = apiSpecificPermissions
						.map(p => allResources.filter(r => p["api_version_id"] === r["api_version"]))
						.flat()
						.filter(r => _.isArray(r["resource_methods"]))
						.map(r => r["resource_methods"].map( function(m) {
							return {
								apiVersionId : r["api_version"],
								resourceId : r["id"],
								httpVerb : m
							};
						}))
						.flat();

						var resourceSpecificDetailedPermissions = resourceSpecificPermissions
						.map( p => allResources.filter(r => r["id"] === p["resource_id"]))
						.flat()
						.map(r => r["resource_methods"].map( function(m) {
							return {
								apiVersionId : r["api_version"],
								resourceId : r["id"],
								httpVerb : m
							};
						}))
						.flat();

						var methodSpecificDetailedPermissions = methodSpecificPermissions
						.map(function(p) {
							var result = {};
							var method = app.permissions["methods"][p["resource_method_id"]];
							result.httpVerb = method["http_verb"];
							result.resourceId = method["resource_id"];
							result.apiVersionId = app.permissions["resources"][result.resourceId]["api_version_id"];
							return result;
						});

						app.detailedPermissions = []
							.concat(apiSpecificDetailedPermissions)
							.concat(resourceSpecificDetailedPermissions)
							.concat(methodSpecificDetailedPermissions);

						app.detailedPermissions.forEach(p => {
							var resource = allResources.find(r => r.id === p.resourceId);
							p.path = resource.path;
							p.name = resource.name;
							var apiVersion = app.permissions.versions[p.apiVersionId];
							var api = app.permissions.apis[apiVersion["api_id"]];
							p.apiVersionPath = apiVersion.path;
							p.apiName = api.name;
							p.apiId = api.id;
						});
						
						return app;
					});
				}


				return Promise.resolve(app);
			}
		);
	}else {
		alert("You must select an application!");
	}

}

var appendLogsToApplication = function(app, entrypoints) {
	var requestsParameters = entrypoints.map(e => app.detailedPermissions.map(function(p) {
		var result = _.cloneDeep(p);
		result.applicationId = app.id;
		result.entrypointId = e.id;
		return result;
	})).flat();

	var promises = [];
	var requestsPerBatch = 30;
	var batchTime = 10000;
	var startAfter = 0;

	do {
		var currentRequests = [];
		if(requestsParameters.length >= requestsPerBatch) {
			for(var i =0; i < requestsPerBatch; i++) {
				currentRequests.push(requestsParameters.pop());
			}
		}else {
			currentRequests = currentRequests.concat(requestsParameters);
			requestsParameters.splice(0,requestsParameters.length);
		}

		startAfter += batchTime;
		promises.push(sleep(startAfter, currentRequests).then(param => executeLogBatchRequest(param)));
	}while(requestsParameters.length != 0)


	return Promise.all(promises).then(function(responses) {
		app.logs = responses.flat();
		return Promise.resolve(app);
	});
}

var executeLogBatchRequest = function(requests) {
	return Promise.all(requests.map(r => fetchPlus("https://analytics-api-aws.api.zup.me/logs/search", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"body": JSON.stringify(createLogByResourceMethodFilter(r.apiVersionId, r.entrypointId, r.resourceId, r.httpVerb, r.applicationId)),
		"method": "POST",
		"mode": "cors",
		"credentials": "omit"
	}, 10).then(response => response.json().then(json => ({ request: r, response: json })))));
}

var downloadCurrentAppLogs = function() {

	var entrypoints = [{ id: 183, name: "dev" },
	{ id: 184, name: "qa" },
	{ id: 185, name: "prod" }];

	$(".full-page-loading").addClass("show");
	getCurrentApplication()
		.then(app => appendLogsToApplication(app, entrypoints))
		.then(function(app) {
			var reportHeader = ['Aplicação', 'Api', 'Versão', 'Recurso', 'Método', 'Path'];
			reportHeader = reportHeader.concat(entrypoints
				.map(e => [
					'Total chamadas ' + e.name.toUpperCase(),
					'Chamada mais recente ' + e.name.toUpperCase()
				]
				).flat());

			var logsByRequest = _.groupBy(app.logs, "request.resourceId");
			var requestIds = _.keys(logsByRequest);

			var rows = requestIds.map( id => 
				[
					app.name,
					logsByRequest[id][0].request.apiName,
					logsByRequest[id][0].request.apiVersionPath,
					logsByRequest[id][0].request.name,
					logsByRequest[id][0].request.httpVerb,
					logsByRequest[id][0].request.path,
					entrypoints.map(e => {
						var envLog = logsByRequest[id].find(l => l.request.entrypointId === e.id);
						if(_.isObject(envLog)) {
							return [envLog.response.hits.total, envLog.response.hits.hits[0] ? envLog.response.hits.hits[0]['_source']['@timestamp'] : '']
						}
						return [0,''];
					} ).flat()
				].flat() );

			rows = _.sortBy(rows, r => r[1]);

			var reportConfig = { title: "RelatorioLogApp", fileName: "Relatorio_Log_App_" + app.name  };

			exportAsExcel(reportHeader, rows, reportConfig);
			$(".full-page-loading").removeClass("show");
		});
}



//All applications

var getApps = function () {
	return fetch("https://api-manager-saas.api.zup.me/client_applications", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
};

var appendAppPermisions = function (app) {
	return fetch("https://api-manager-saas.api.zup.me/client_applications/" + app.id + "/client_application_permissions", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json().then(function (permissions) { app.permissions = permissions; return app; }));
};

var getDetailedApp = function (appId) {
	return fetch("https://api-manager-saas.api.zup.me/client_applications/" + appId, {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
}

var getAllApplications = function () {
	return getApps().then(
		apps => Promise.all(apps.map(app => getDetailedApp(app.id)))
	).then(
		apps => Promise.all(apps.map(app => appendAppPermisions(app)))
	);
}


function getPermissionEntityName(permission, source, searchEntity) {
	if (searchEntity === 'API') {
		if (_.isNumber(permission.api_version_id)) {
			return source.apis[source.versions[permission.api_version_id].api_id];
		}
		if (_.isNumber(permission.resource_id)) {
			return getPermissionEntityName({ api_version_id: source.resources[permission.resource_id].api_version_id }, source, searchEntity);
		}
		if (_.isNumber(permission.resource_method_id)) {
			return getPermissionEntityName({ resource_id: source.methods[permission.resource_method_id].resource_id }, source, searchEntity);
		}
	}
	if (searchEntity === 'VERSION') {
		if (_.isNumber(permission.api_version_id)) {
			return source.versions[permission.api_version_id];
		}
		if (_.isNumber(permission.resource_id)) {
			return getPermissionEntityName({ api_version_id: source.resources[permission.resource_id].api_version_id }, source, searchEntity);
		}
		if (_.isNumber(permission.resource_method_id)) {
			return getPermissionEntityName({ resource_id: source.methods[permission.resource_method_id].resource_id }, source, searchEntity);
		}
	}
	if (searchEntity === 'RESOURCE') {
		if (_.isNumber(permission.api_version_id)) {
			return { name: '*' };
		}
		if (_.isNumber(permission.resource_id)) {
			return source.resources[permission.resource_id];
		}
		if (_.isNumber(permission.resource_method_id)) {
			return getPermissionEntityName({ resource_id: source.methods[permission.resource_method_id].resource_id }, source, searchEntity);
		}
	}
	if (searchEntity === 'METHOD') {
		if (_.isNumber(permission.api_version_id) || _.isNumber(permission.resource_id)) {
			return { http_verb: '*' };
		}
		if (_.isNumber(permission.resource_method_id)) {
			return source.methods[permission.resource_method_id];
		}
	}

}


var downloadApplicationsExcelReport = function () {
	$(".full-page-loading").addClass("show");
	getAllApplications().then(function (apps) {

		var resourcesSheetHeader = ['Aplicação', 'API', 'Versão', 'Recurso', 'Método', 'Autenticado'];

		var resourcesSheetRows = apps.map(
			app => app.permissions.permissions.map(
				p => [app.name,
				getPermissionEntityName(p, app.permissions, 'API').name,
				getPermissionEntityName(p, app.permissions, 'VERSION').path,
				getPermissionEntityName(p, app.permissions, 'RESOURCE').name,
				getPermissionEntityName(p, app.permissions, 'METHOD').http_verb,
				p.authenticable ? 'Sim' : 'Não']
			)
		).flat();

		var attributesSheetHeader = ['Aplicação', 'Chave', 'Valor'];
		var attributesSheetRows = apps.filter(app => _.isArray(app.attributes)).map(
			app => app.attributes.map(
				attr => [app.name,
				attr.name,
				attr.value.content]
			)
		).flat();


		var reportConfig = { title: "RelatorioApps", fileName: "Relatorio_Apps" };

		exportAsExcelMultipleSheets([
			{
				name: "Recursos",
				header: resourcesSheetHeader,
				items: resourcesSheetRows
			},
			{
				name: "Atributos",
				header: attributesSheetHeader,
				items: attributesSheetRows
			}
		], reportConfig);

		$(".full-page-loading").removeClass("show");
	});



}

//Download api resources log


var getDetailedApi = function (apiId) {
	return fetch("https://api-manager-saas.api.zup.me/apis/" + apiId, {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"body": null,
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(a => a.json());
}

var getApiVersionResources = function (apiVersion) {
	return fetch("https://api-manager-saas.api.zup.me/api_versions/" + apiVersion + "/resources", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"body": null,
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(a => a.json());
}

var createLogByResourceMethodFilter = function (apiVersionId, entrypointId, resourceId, httpVerb, applicationId) {

	var today = moment();
	var thirtyDaysAgo = moment().subtract(30, 'days');

	return getFormattedFilters(
		{
			startDate: thirtyDaysAgo,
			endDate: today,
			apiVersionId: apiVersionId,
			entrypointId: entrypointId,
			applicationId : applicationId,
			resourceId: resourceId,
			httpVerb: httpVerb
		}, 1, "5m");

};

var appendResourceLogs = function (resource, entrypoints) {

	if(!_.isArray(resource.resource_methods)) {
		return Promise.resolve(resource);
	}

	var requestsParameters = entrypoints.map(e => resource.resource_methods.map(m => (
		{ apiVersionId: resource.api_version, entrypointName: e.name, entrypointId: e.id, resourceId: resource.id, httpVerb: m }))).flat();

	var requests = requestsParameters.map(r => fetchPlus("https://analytics-api-aws.api.zup.me/logs/search", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"body": JSON.stringify(createLogByResourceMethodFilter(r.apiVersionId, r.entrypointId, r.resourceId, r.httpVerb)),
		"method": "POST",
		"mode": "cors",
		"credentials": "omit"
	}, 10).then(response => response.json().then(json => ({ request: r, response: json }))));

	return Promise.all(requests).then(
		function (datas) {

			resource.logs = datas.map(d => ({
				method: d.request.httpVerb,
				item: {
					env: d.request.entrypointName,
					total: d.response.hits.total,
					mostRecentCallAt: d.response.hits.hits[0] ? d.response.hits.hits[0]['_source']['@timestamp'] : undefined
				}
			}));


			resource.logs = _.uniq(resource.logs.map(r => r.method)).map(m => ({ method: m, items: resource.logs.filter(r => r.method === m).map(r => r.item) }));

			return Promise.resolve(resource);
		}
	);
};

var appendApiResourcesByVersion = function (api) {
	var requests = api.versions.map(v => getApiVersionResources(v.id));
	return Promise.all(requests).then(
		function (datas) {
			datas = datas.flat();
			api.resources = api.versions.map(v => ({ version: v.path.replace('/', ''), resources: datas.filter(d => d.api_version === v.id) }));
			return Promise.resolve(api);
		}
	);
};

var appendApiResourcesLogsByVersion = function (api, entrypoints) {
	var resources = api.resources.map(r => r.resources).flat();
	var requests = resources.map(r => appendResourceLogs(r, entrypoints));
	return Promise.all(requests).then(r => Promise.resolve(api));
};

var downloadAllApiResources = function () {

	var entrypoints = [{ id: 183, name: "dev" },
	{ id: 184, name: "qa" },
	{ id: 185, name: "prod" }];

	$(".full-page-loading").addClass("show");
	getApis()
		.then(apis => Promise.all(apis.map(api => appendApiResourcesByVersion(api))))
		//.then(apis => Promise.all(apis.map(api => appendApiResourcesLogsByVersion(api, entrypoints))))
		.then(function(apis) {	
			var apiExecutionTime = 10000; //average time to an api complete execution
			var startAfter = 0;
			var promises = [];
			for(var api in apis) {
				startAfter += apiExecutionTime;
				promises.push(sleep(startAfter, apis[api]).then(param => appendApiResourcesLogsByVersion(param, entrypoints)));
			}

			return Promise.all(promises);
		}).then(function (apis) {

			window.apis = apis;
			
			var resourcesHeader = ['Recurso', 'URL', 'Método'];
			resourcesHeader = resourcesHeader.concat(entrypoints
				.map(e => [
					'Total chamadas ' + e.name.toUpperCase(),
					'Chamada mais recente ' + e.name.toUpperCase()
				]
				).flat());

			var excels = [];

			var zip = new JSZip();

			zip.file("fullReport.json", JSON.stringify(snakeToCamel(apis), null, "\t"));

			var uselessResources = apis.filter(api => _.isArray(api.resources)).map(api => api.resources).flat().map(v => v.resources).flat().filter(r => _.isArray(r.logs) && r.logs.every(l => l.items.every(i => i.total === 0) ) ).map(r => r.id);

			zip.file("uselessResources.json", JSON.stringify(uselessResources));

			for (var api in apis) {

				if(!_.isArray(apis[api].resources)) {
					console.log('Api' + apis[api].name + ' pulada por nao ter recursos');
					continue;
				}

				apis[api].resources.forEach(r => r.resources = r.resources.filter(res => _.isArray(res.logs)));

				var resourcesSheets = apis[api].resources.map(
					resourcesByApiVersion => ({
						name: resourcesByApiVersion.version,
						header: resourcesHeader,
						items: resourcesByApiVersion.resources.map(
							resource => resource.logs.map(
								logByMethod => (
									[resource.name,
									resource.path,
									logByMethod.method,
									entrypoints.map(function (env) {
										var log = logByMethod.items.find(l => l.env === env.name);
										if (_.isObject(log)) {
											return [log.total, _.isString(log.mostRecentCallAt) ? log.mostRecentCallAt : ''];
										} else {
											return [0, ''];
										}
									}).flat()
									].flat())
							)
						).flat()
					})
				);

				var reportConfig = { title: "Relatorio_" + apis[api].name, fileName: "Relatorio_" + apis[api].name };
				var excelFile = buildExcelMultipleSheets(resourcesSheets, reportConfig);
				zip.file(excelFile.filename, excelFile.content);
			}

			zip.generateAsync({ type: "blob" })
				.then(function (content) {
					saveAs(content, "ApiLogs.zip");
				});

			$(".full-page-loading").removeClass("show");

		});

}



var downloadApiResources = function () {

	var entrypoints = [{ id: 183, name: "dev" },
	{ id: 184, name: "qa" },
	{ id: 185, name: "prod" }];

	var currentApi = document.URL.replace(/(.*\/api\/)(\d+)(.*)/, "$2");
	if (!isNaN(currentApi)) {
		$(".full-page-loading").addClass("show");
		getDetailedApi(currentApi)
			.then(api => appendApiResourcesByVersion(api))
			.then(api => appendApiResourcesLogsByVersion(api, entrypoints))
			.then(function (api) {
				var resourcesHeader = ['Recurso', 'URL', 'Método'];
				resourcesHeader = resourcesHeader.concat(entrypoints
					.map(e => [
						'Total chamadas ' + e.name.toUpperCase(),
						'Chamada mais recente ' + e.name.toUpperCase()
					]
					).flat());

				var resourcesSheets = api.resources.map(
					resourcesByApiVersion => ({
						name: resourcesByApiVersion.version,
						header: resourcesHeader,
						items: resourcesByApiVersion.resources.map(
							resource => resource.logs.map(
								logByMethod => (
									[resource.name,
									resource.path,
									logByMethod.method,
									entrypoints.map(function (env) {
										var log = logByMethod.items.find(l => l.env === env.name);
										if (_.isObject(log)) {
											return [log.total, _.isString(log.mostRecentCallAt) ? log.mostRecentCallAt : ''];
										} else {
											return [0, ''];
										}
									}).flat()
									].flat())
							)
						).flat()
					})
				);

				var reportConfig = { title: "Relatorio_" + api.name, fileName: "Relatorio_" + api.name };
				exportAsExcelMultipleSheets(resourcesSheets, reportConfig);
				$(".full-page-loading").removeClass("show");
			});
	} else {
		alert('You must select an API on APIs List!');
	}
}

//Get portals

var getAllPortals = function () {
	return getPortals().then(
		portals => Promise.all(portals.map(p => getDetailedPortal(p.id)))
	).then(
		portals => Promise.all(portals.map(p => appendPortalApplications(p)))
	).then(
		portals => Promise.all(portals.map(p => appendPortalDetailedClientApplications(p)))
	).then(
		portals => Promise.all(portals.map(p => appendPortalDevelopers(p)))
	).then(
		portals => Promise.all(portals.map(p => appendPortalLogs(p)))
	).then(
		portals => Promise.all(portals.map(p => appendPortalDevelopersContactData(p)))
	).then(
		portals => Promise.resolve(
			_.sortBy(portals, p => { 
				if(_.isArray(p.logs) && _.isObject(p.logs.find(l => l.filter.entrypointId === 68))) {
					var result = p.logs.find(l => l.filter.entrypointId === 68).result.total;
					return result; 
				}    
				return 0;  
			}).reverse()
		)
	);
	
}

var getPortals = function () {
	return fetch("https://api-manager-saas.api.zup.me/developer_portals", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
};

var getDetailedPortal = function (pId){
	return fetch("https://api-manager-saas.api.zup.me/developer_portals/" + pId, {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json());
}

var appendPortalApplications = function (p) {
	return fetch("https://api-manager-saas.api.zup.me/developer_portals/" + p.id + "/client_applications", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json().then(function (applications) { p.applications = applications; return p; }));
};

var appendPortalDetailedClientApplications = function(p) {
	if(_.isArray(p.applications) && p.applications.length > 0) {
		return Promise.all(
			p.applications.map(app => getDetailedApp(app["client_application"]["id"]))
		).then(function(clientApplications) { p.clientApplications = clientApplications; return p;});
	} 
	return Promise.resolve(p);
}

var appendPortalDevelopers = function (p) {
	return fetch("https://api-manager-saas.api.zup.me/developer_portals/" + p.id +"/developers?page=1&per_page=100", {
		"headers": getCommonHeaders(),
		"referrer": "https://vli.zup.me/api-manager/",
		"referrerPolicy": "no-referrer-when-downgrade",
		"method": "GET",
		"mode": "cors",
		"credentials": "omit"
	}).then(response => response.json().then(function (developers) { p.developers = developers.developers; return p; }));
};

var appendPortalLogs = function(p) {
	if(_.isArray(p.clientApplications) && p.clientApplications.length > 0
		 && _.isArray(p["default_entry_points"]) && p["default_entry_points"].length > 0 ) {

		var requests =  p["default_entry_points"].map(e => ({applicationId : p.clientApplications[0].id, entrypointId : e.id }));
		return Promise.all(requests.map(r => fetchPlus("https://analytics-api-aws.api.zup.me/logs/search", {
			"headers": getCommonHeaders(),
			"referrer": "https://vli.zup.me/api-manager/",
			"referrerPolicy": "no-referrer-when-downgrade",
			"body": JSON.stringify(createLogByResourceMethodFilter(r.apiVersionId, r.entrypointId, r.resourceId, r.httpVerb, r.applicationId)),
			"method": "POST",
			"mode": "cors",
			"credentials": "omit"
		}, 10).then(response => response.json().then(json => ({ filter: r, result: { total : json.hits.total, mostRecentCallAt: json.hits.hits[0] ? json.hits.hits[0]['_source']['@timestamp'] : undefined} })))))
		.then(function(logs) { p.logs = logs; return p;});
	}
	return Promise.resolve(p);
}

var appendPortalDevelopersContactData = function (p) {

	if(_.isArray(p.developers) && p.developers.length > 0 ) {
		var requests = p.developers.filter(d => d.applications.length > 0).map(d => 
			fetch("https://api-manager-saas.api.zup.me/developer_applications/" + d.applications[0].id +"/developers", {
				"headers": getCommonHeaders(),
				"referrer": "https://vli.zup.me/api-manager/",
				"referrerPolicy": "no-referrer-when-downgrade",
				"method": "GET",
				"mode": "cors",
				"credentials": "omit"
			}).then(response => response.json())
		)
		return Promise.all(requests).then(function(contacts) { p.developersContacts = contacts.flat(); return p; });
	}
	
	return Promise.resolve(p);
};


//COMMON


var buildExcelMultipleSheets = function (sheets, reportConfig) {

	var wb = XLSX.utils.book_new();
	wb.Props = {
		Title: reportConfig && reportConfig.title ? reportConfig.title : "Relatório",
		Subject: reportConfig && reportConfig.title ? reportConfig.subject : "Relatório",
		Author: "API Manager Enhancer",
		CreatedDate: new Date()
	};

	wb.SheetNames = wb.SheetNames.concat(sheets.map(sheet => sheet.name));
	var sheetsData = sheets.map(sheet => ({ name: sheet.name, data: XLSX.utils.aoa_to_sheet([sheet.header].concat(sheet.items)) }));
	sheetsData.forEach(sheetData => wb.Sheets[sheetData.name] = sheetData.data);
	var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
	function s2ab(s) {
		var buf = new ArrayBuffer(s.length);
		var view = new Uint8Array(buf);
		for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
		return buf;
	}

	return {
		content: new Blob([s2ab(wbout)], { type: "application/octet-stream" }),
		filename: (reportConfig && reportConfig.fileName ? reportConfig.fileName : "Relatorio") + '.xlsx'
	};

}

var exportAsExcelMultipleSheets = function (sheets, reportConfig) {
	var excelFile = buildExcelMultipleSheets(sheets, reportConfig);
	return saveAs(excelFile.content, excelFile.filename);
}


var exportAsExcel = function (reportHeader, rows, reportConfig) {

	var wb = XLSX.utils.book_new();
	wb.Props = {
		Title: reportConfig && reportConfig.title ? reportConfig.title : "Relatório",
		Subject: reportConfig && reportConfig.title ? reportConfig.subject : "Relatório",
		Author: "API Manager Enhancer",
		CreatedDate: new Date()
	};
	var reportSheetName = "Relatorio";
	wb.SheetNames.push(reportSheetName);
	var ws_data = [reportHeader].concat(rows);
	var ws = XLSX.utils.aoa_to_sheet(ws_data);
	wb.Sheets[reportSheetName] = ws;
	var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
	function s2ab(s) {
		var buf = new ArrayBuffer(s.length);
		var view = new Uint8Array(buf);
		for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
		return buf;
	}
	return saveAs(new Blob([s2ab(wbout)], { type: "application/octet-stream" }), (reportConfig && reportConfig.fileName ? reportConfig.fileName : "Relatorio") + '.xlsx');

}

function sleep (time, param) {
	return new Promise((resolve) => setTimeout(() => resolve(param), time));
  }


const fetchPlus = (url, options = {}, retries) =>
  fetch(url, options)
    .then(res => {
      if (res.ok) {
        return Promise.resolve(res);
      }
      if (retries > 0) {
        return fetchPlus(url, options, retries - 1)
      }
      throw new Error(res.status)
    })
    .catch(error => console.error(error.message))


function getFormattedFilters(e, size, scroll) {
	return {
		"search": {
			"indexes": Array.of(e.startDate?.format("YYYYMMDD"), e.endDate?.format("YYYYMMDD")).filter(n => n).sort(),
			"entrypoint_id": e.entrypointId,
			"start_date": e.startDate?.format("YYYY-MM-DDT00:00:00.000\\Z"),
			"end_date": e.endDate?.format("YYYY-MM-DDT00:00:00.000\\Z"),
			"api_version_id": e.apiVersionId,
			"application_id": e.applicationId,
			"resource_id": e.resourceId,
			"http_verb" : e.httpVerb?.http_verb,
			"scroll": scroll,
			"size": size
		}
	};
}

