var scripts = ['vendors.js','export.js'];

var scriptElements = scripts.map(s => document.createElement('script'));
scriptElements.forEach((el,idx) => el.src = chrome.runtime.getURL(scripts[idx]));
scriptElements.forEach(el => el.onload = function() { this.remove()} );
scriptElements.forEach(el => (document.head || document.documentElement).appendChild(el));


document.addEventListener('downloadLogs', function() {
  console.log('Evento disparado');
  downloadApiLogs();
});

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if( request.message === "downloadLogs" ) {
      executeScriptsOnPage(["downloadApiLogs();"]);
    }
    if( request.message === "exportApis" ) {
      executeScriptsOnPage(["downloadExport();"]);
    }
    if (request.message === 'downloadEndpoints' ) {
      executeScriptsOnPage(["downloadEndpointGroupExcelReport();"]);
    }
    if (request.message === 'downloadApps' ) {
      executeScriptsOnPage(["downloadApplicationsExcelReport();"]);
    }
    if (request.message === 'downloadCurrentApiLogs' ) {
      executeScriptsOnPage(["downloadApiResources();"]);
    }
    if (request.message === 'downloadCurrentAppLogs' ) {
      executeScriptsOnPage(["downloadCurrentAppLogs();"]);
    }
  }
);

function executeScriptsOnPage(scripts) {
  var scriptElements = scripts.map(s => document.createElement('script'));
  scriptElements.forEach((el,idx) => el.innerHTML = scripts[idx]);
  scriptElements.forEach(el => el.onload = function() { this.remove()} );
  scriptElements.forEach(el => (document.head || document.documentElement).appendChild(el));
}
