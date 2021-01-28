document.getElementById('downloadLogs').onclick = function() {
  chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "downloadLogs"});
  });
}

document.getElementById('exportApis').onclick = function() {
  chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "exportApis"});
  });
}

document.getElementById('downloadEndpoints').onclick = function() {
  chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "downloadEndpoints"});
  });
}

document.getElementById('downloadApps').onclick = function() {
  chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "downloadApps"});
  });
}

document.getElementById('downloadCurrentApiLogs').onclick = function() {
  chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "downloadCurrentApiLogs"});
  });
}

document.getElementById('downloadCurrentAppLogs').onclick = function() {
  chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "downloadCurrentAppLogs"});
  });
}


