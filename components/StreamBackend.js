/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is TeamLiquid Streams.
 *
 * The Initial Developer of the Original Code is
 * cepheusSC.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): xocekim, Fyresoul
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function StreamBackend() {
	this.wrappedJSObject = this;
	if (typeof(this.init) == 'function')
		this.init();
}

StreamBackend.prototype = {
	updating: false,
	serverError: false,
	serverStatus: 0,
	serverStatusText: '',
	idleLimit: 480,
	minQueryTime: 10,
	queryTime: this.minQueryTime,
	userIdle: false,
	initialized: false,
	streamXML: null,
	lastUpdatedManual: 0,
	lastOnline: {},
	favouritesOnline: null,
	favouritesNew: false,
	prefs: null,
	favouritesPref: null,
	
	classDescription: "Backend used for querying the TeamLiquid server for online gaming streams.",
	classID: Components.ID("{444ec8fb-17c4-47c8-8ac1-c4b17a8f4fee}"),
	QueryInterface: XPCOMUtils.generateQI(),
	timer: Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer),
	
	
	getXML: function() {
		return this.streamXML;
	},
	
	setXML: function(xml) {
		this.streamXML = xml;
	},
	
	getFavouritesNew: function() {
		return this.favouritesNew;
	},
	
	setFavouritesNew: function(fn) {
		this.favouritesNew = fn;
	},
	
	getFavouritesOnline: function() {
		return this.favouritesOnline;
	},
	
	setFavouritesOnline: function(fo) {
		this.favouritesOnline = fo;
	},
	
	getLastOnline: function() {
		return this.lastOnline;
	},
	
	setLastOnline: function(lo) {
		this.lastOnline = lo;
	},
	
	getLastManualUpdate: function() {
		return this.lastUpdatedManual;
	},
	
	setLastManualUpdate: function(time) {
		this.lastUpdatedManual = time;
	},
	
	updateOverlays: function() {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.notifyObservers(this, "tlstreams-overlay-update", '1');
	},
	
	updateSidebars: function(eventID) {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.notifyObservers(this, "tlstreams-sidebar-update", eventID);
	},
	
	autoRefresh: function() {
		if (!this.periodicUpdate || this.userIdle)
			return;
		this.updateStreams();
	},
	
	manualRefresh: function() {
		this.setLastManualUpdate(new Date());
		this.updateStreams();
	},
	
	updateStreams: function() {
		if (this.updating || (this.serverStatus >= 400 && this.serverStatus < 500))
			return;
		this.updating = true;
		
		var url = "http://www.teamliquid.net/video/streams/?filter=live&xml=1&src=ffext0.1";
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.onload = this.onLoad;
		req.onerror = this.onError;
		req.open("GET", url, true);
		req.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;
		req.send(null);
	},
	
	onLoad: function() {
		if (this.readyState === 4) {
			var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
			streamBackend.serverStatus = this.status;
			streamBackend.serverStatusText = this.statusText;
			
			if (this.status < 200 || this.status > 300) {
				streamBackend.handleError(this.status, this.statusText);
			}
			else {
				var xml = this.responseXML;
				streamBackend.setXML(xml);
				streamBackend.scanFavourites(xml);
				
				streamBackend.serverError = false;
				streamBackend.updating = false;
				
				streamBackend.updateOverlays();
				streamBackend.updateSidebars('1');
			}
		}
	},
	
	handleError: function(status, statusText) {
		this.serverStatus = status;
		this.serverStatusText = statusText;
		this.serverError = true;
		
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		this.setLastManualUpdate(0);

		var data = [this.serverStatus, this.serverStatusText];
		this.updateSidebars('2');
	},
	
	onError: function() {
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		streamBackend.updating = false;
		streamBackend.handleError(this.status, this.statusText);
	},
	
	scanFavourites: function(xml) {
		if (xml == null)
			return;
		
		var lastOnline = this.getLastOnline();
		var favourites = JSON.parse(this.favouritesPref);
		var favStreams = [];
		var favouritesNew = false;
		
		var streams = xml.getElementsByTagName('stream');
		
		for (var i = 0; i < streams.length; i++) {
			var curStream = streams[i];
			var owner = curStream.getAttribute('owner');
			if (favourites[owner]) {
				favStreams.push(curStream);
				if (!lastOnline[owner]) {
					lastOnline[owner] = true;
					favouritesNew = true;
				}
			}
		}
		
		this.setLastOnline(lastOnline);
		this.setFavouritesOnline(favStreams);
		this.setFavouritesNew(favouritesNew);
	},
	
	favouritesChanged: function() {
		var xml = this.getXML();
		this.scanFavourites(xml);
	},
	
	idleObserver: {
		observe: function(subject, topic, data) {
			var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
			if (topic == 'idle')
				streamBackend.userIdle = true;
			else { //back
				streamBackend.userIdle = false;
				streamBackend.autoRefresh();
			}
		}
	},
	
	initIdle: function() {
		var idleService = Components.classes["@mozilla.org/widget/idleservice;1"].getService(Components.interfaces.nsIIdleService);
		idleService.addIdleObserver(this.idleObserver, this.idleLimit);
	},
	
	shutdownObserver: {
		observe: function(subject, topic, data) {
			if (topic == "xpcom-will-shutdown") {
				var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
				var idleService = Components.classes["@mozilla.org/widget/idleservice;1"].getService(Components.interfaces.nsIIdleService);
				idleService.removeIdleObserver(streamBackend.idleObserver, streamBackend.idleLimit);
				streamBackend._branch.removeObserver("", streamBackend.visibilityObserver);
			}
		}
	},
	
	visibilityObserver: {
		observe: function(subject, topic, data) {
			if (topic == 'nsPref:changed') {
				//if a change occurs in the visibility preferences for columns, update sidebars to reflect this change
				var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
				streamBackend.updateSidebars('1');
			}
		}
	},
	
	prefObserver: {
		observe: function(subject, topic, data) {
			if (topic == 'nsPref:changed') {
				var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
				switch (data) {
					case 'periodicUpdate':
						streamBackend.periodicUpdate = streamBackend._branch.getBoolPref(data);
					break;
					case 'favourites':
						streamBackend.favouritesPref = streamBackend._branch.getCharPref(data);
					break;
					case 'queryTime':
						streamBackend.queryTime = streamBackend._branch.getIntPref(data);
						if (streamBackend.queryTime < streamBackend.minQueryTime)
							streamBackend.queryTime = streamBackend.minQueryTime;
							
						streamBackend.timer.cancel();
						streamBackend.initTimeEvent(streamBackend.queryTime);
					break;
				}
			}
		}
	},
	
	initTimeEvent: function(queryTime) {
		var event = {
			observe: function(subject, topic, data) {
				var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
				streamBackend.autoRefresh();
			}
		}
		this.timer.init(event, queryTime * 60000, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
	},
	
	init: function() {
		if (this.initialized)
			return;
		this.initialized = true;
		
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(this.shutdownObserver, "xpcom-will-shutdown", false);
		
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
		this._branch = prefService.getBranch("extensions.tlstreams.");
		this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this._branch.addObserver("columns.", this.visibilityObserver, false);
		this._branch.addObserver("", this.prefObserver, false);
		
		this.favouritesPref = this._branch.getCharPref('favourites');
		this.queryTime = this._branch.getIntPref('queryTime');
		this.periodicUpdate = this._branch.getBoolPref('periodicUpdate');
		this.initTimeEvent(this.queryTime);
		
		this.initIdle();
		this.updateStreams();
	}
};

var components = [StreamBackend];

if (XPCOMUtils.generateNSGetFactory) {
	var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
}
else
	var NSGetModule = XPCOMUtils.generateNSGetModule(components);