(function () {
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script')
    return scripts[scripts.length - 1]
  })()
  var businessId = currentScript && (currentScript.getAttribute('data-business-id') || currentScript.getAttribute('data-client-id'))
  var botId = currentScript && currentScript.getAttribute('data-bot-id')
  if (!businessId) return
  var origin = (currentScript && currentScript.src ? new URL(currentScript.src).origin : 'https://instantdesk.pl')
  var frameId = 'instantdesk-widget-frame'
  if (document.getElementById(frameId)) return
  var iframe = document.createElement('iframe')
  iframe.id = frameId
  iframe.title = 'InstantDesk chat'
  iframe.src = origin + '/embed/' + encodeURIComponent(businessId) + '?instantdesk_business_id=' + encodeURIComponent(businessId) + (botId ? '&bot_id=' + encodeURIComponent(botId) : '') + '&instantdesk_open=0'
  iframe.allow = 'clipboard-write'
  iframe.style.position = 'fixed'
  iframe.style.right = '18px'
  iframe.style.bottom = '18px'
  iframe.style.width = '430px'
  iframe.style.height = '720px'
  iframe.style.maxWidth = 'calc(100vw - 24px)'
  iframe.style.maxHeight = 'calc(100vh - 24px)'
  iframe.style.border = '0'
  iframe.style.background = 'transparent'
  iframe.style.zIndex = '2147483000'
  iframe.style.colorScheme = 'normal'
  document.body.appendChild(iframe)
})()
