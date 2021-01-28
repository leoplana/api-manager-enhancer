const kMatchRule = {
  // Declare the rule conditions.
  conditions: [new chrome.declarativeContent.PageStateMatcher({
    pageUrl: {hostEquals: 'vli.zup.me', schemes : ['https']},
  })],
  // Shows the page action when the condition is met.
  actions: [new chrome.declarativeContent.ShowPageAction()]
}

// Register the runtime.onInstalled event listener.
chrome.runtime.onInstalled.addListener(function() {
  // Overrride the rules to replace them with kMatchRule.
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
    chrome.declarativeContent.onPageChanged.addRules([kMatchRule]);
  });
});
