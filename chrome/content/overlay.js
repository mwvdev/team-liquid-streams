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

if (typeof(tlstreams) == "undefined")
	var tlstreams = {};

(function() {
	this.strings = null;
	this.squelchButton = false;
	this.timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
	
	this.extractStreamLink = function(stream) {
		var curStreamTypes = stream.getElementsByTagName('link');
		var link = null;
		for (var j = 0; j < curStreamTypes.length; j++) {
			var curType = curStreamTypes[j];
			if (curType.getAttribute('type') == 'embed')
				link = curType.firstChild.nodeValue;
		}
		
		return link;
	};
	
	this.displayPopup = function(streams) {
		var popupPref = nsPreferences.getBoolPref('extensions.tlstreams.showPopups');
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		var favouritesNew = streamBackend.getFavouritesNew();
		if (!streams || !popupPref || !favouritesNew)
			return;
		streamBackend.setFavouritesNew(false);
		
		function createPopup(favourite, index) {
			return {
				label: favourite.getAttribute('owner'),
				accessKey: index+1 <= 9 ? index+1 : 'Q',
				callback: function() {
					var link = tlstreams.extractStreamLink(favourite);
					gBrowser.addTab(link);
				}
			};
		}
		
		var secondary = [];
		if (streams.length > 0) {
			for (var i = 0; i < streams.length; i++) {
				popup = createPopup(streams[i], i);
				secondary.push(popup);
			}
		}
		
		if (secondary.length == 0)
			return;
		
		PopupNotifications.show(gBrowser.selectedBrowser, "favourites-popup",
			this.strings.getString('NewFavourites'),
			null, /* anchor ID */
			{
				label: this.strings.getString('ViewAllStreams'),
				accessKey: this.strings.getString('ViewAllStreamsAccessKey'),
				callback: function() {
					toggleSidebar('viewSidebar_tlstreams', true);
				}
			},	
			secondary);
	};
	
	this.overlayObserver = {
		observe: function(subject, topic, data) {
			if (topic == "tlstreams-overlay-update") {
				switch(data) {
					case '1':
						tlstreams.updateOverlay();
					break;
				}
			}
		}
	};
	
	/* Menu methods */
	
	this.menuPopupShowing = function() {
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		var streams = streamBackend.getFavouritesOnline();
		
		var menu = tlstreams.initMenu();
		var periodicUpdate = nsPreferences.getBoolPref('extensions.tlstreams.periodicUpdate');
		
		var periodicUpdateMenu = document.createElement('menuitem');
		periodicUpdateMenu.setAttribute('type', 'checkbox');
		periodicUpdateMenu.setAttribute('tooltiptext', tlstreams.strings.getString('TogglePeriodicTooltip'));
		periodicUpdateMenu.setAttribute('label', tlstreams.strings.getString('TogglePeriodicMenuItem'));
		periodicUpdateMenu.setAttribute('checked', periodicUpdate);
		periodicUpdateMenu.addEventListener('command', tlstreams.menuPeriodicChange);
		menu.appendChild(periodicUpdateMenu);
		
		var menuSeperator = document.createElement('menuseparator');
		menu.appendChild(menuSeperator);
		
		if (streams == null || streams.length == 0) {
			var newFavouriteMenu = document.createElement('menuitem');
			newFavouriteMenu.className = 'menuitem-iconic';
			newFavouriteMenu.setAttribute('disabled', 'true');
			newFavouriteMenu.setAttribute('label', tlstreams.strings.getString('NoFavouritesOnline'));
			menu.appendChild(newFavouriteMenu);
		}
		else {
			for (var i = 0; i < streams.length; i++) {
				var curStream = streams[i];
				var link = tlstreams.extractStreamLink(curStream);
				
				if (link != null) {
					var newFavouriteMenu = document.createElement('menuitem');
					newFavouriteMenu.className = 'menuitem-iconic';
					var channel = curStream.getElementsByTagName('channel');
					if (channel.length == 0)
						continue;
					newFavouriteMenu.setAttribute('label', channel[0].getAttribute('title'));
					newFavouriteMenu.setAttribute('link', link);
					newFavouriteMenu.addEventListener('command', tlstreams.menuOpenStream);
					menu.appendChild(newFavouriteMenu);
				}
			}
		}
	};
	
	this.menuPeriodicChange = function() {
		tlstreams.squelchButton = true;
		var checked = this.getAttribute('checked') ? true : false;
		nsPreferences.setBoolPref('extensions.tlstreams.periodicUpdate', checked);
	};
	
	this.menuOpenStream = function() {
		tlstreams.squelchButton = true;
		gBrowser.selectedTab = gBrowser.addTab(this.getAttribute('link'));
	};
	
	this.onMenuItemCommand = function(e) {
		toggleSidebar('viewSidebar_tlstreams');
	};

	this.onToolbarButtonCommand = function(e) {
		if (!tlstreams.squelchButton)
			tlstreams.onMenuItemCommand(e);
		tlstreams.squelchButton = false;
	};
	
	/* End menu methods */
	
	/* Update methods */
	
	this.updateFavourites = function(favStreams) {
		tlstreams.updateStatus(favStreams);
	};
	
	this.updateOverlay = function() {
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		var favStreams = streamBackend.getFavouritesOnline();
		if (favStreams == null)
			return;
	
		this.updateFavourites(favStreams);
		this.displayPopup(favStreams);
	};
	
	this.updateStatus = function(streams) {
		var showStatusFavourites = nsPreferences.getBoolPref('extensions.tlstreams.showStatusFavourites');
		if (showStatusFavourites) {
			var icon = document.getElementById('status-bar-favourites-icon');
			icon.setAttribute('hidden', 'false');
			var status = document.getElementById('status-bar-favourites');
			status.setAttribute('hidden', 'false');
			streamCount = streams.length;
			var message = this.strings.getFormattedString('FavouritesStatus', [streamCount]);
			status.setAttribute('label', message);
		}
	};
	
	/* End update methods */
	
	/* Initialisation methods */
	
	this.firstRun = function() { //Source: https://developer.mozilla.org/En/Code_snippets:Toolbar#Adding_button_by_default
		var btnID    = "tlstreams-toolbar-button"; // ID of button to add
		var afterID = "urlbar-container";    // ID of element to insert after
		var navBar  = document.getElementById("nav-bar");
		var curSet  = navBar.currentSet.split(",");

		if (curSet.indexOf(btnID) == -1) {
			var pos = curSet.indexOf(afterID) + 1 || curSet.length;
			var set = curSet.slice(0, pos).concat(btnID).concat(curSet.slice(pos));

			navBar.setAttribute("currentset", set.join(","));
			navBar.currentSet = set.join(",");
			document.persist(navBar.id, "currentset");
			try {
				BrowserToolboxCustomizeDone(true);
			}
			catch (e) {}
		}
	};
	
	this.initMenu = function() {
		var menu = document.getElementById('favourites-popup');
		while(menu.hasChildNodes()){
			menu.removeChild(menu.firstChild);
		}
		
		menu.addEventListener('popupshowing', tlstreams.menuPopupShowing);
		return menu;
	};
	
	this.initOverlay = function() {
		tlstreams.timer = null;
		
		tlstreams.initStrings();
		
		if (nsPreferences.getBoolPref('extensions.tlstreams.firstRun')) {
			tlstreams.firstRun();
			nsPreferences.setBoolPref('extensions.tlstreams.firstRun', false);
		}
		
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(tlstreams.overlayObserver, 'tlstreams-overlay-update', false);
		
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;

		tlstreams.initMenu();
		tlstreams.updateOverlay();
	};
	
	this.initStrings = function() {
		this.strings = document.getElementById("tlstreams-strings");
	};
	
	this.initTimeEvent = function() {
		var event = {
			observe: function(subject, topic, data) {
				tlstreams.initOverlay();
			}
		}
		this.timer.init(event, 500, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
	},
	
	/* End initialisation methods */
	
	/* Load and unload methods */
	
	this.onLoad = function() {
		//defer for later to increase overall Firefox performance:
		//https://developer.mozilla.org/en/Extensions/Performance_best_practices_in_extensions#Defer_everything_that_you_can
		this.initTimeEvent();
	};
	
	this.onUnload = function() {
		if (tlstreams.manualTimeout != null)
			window.clearTimeout(tlstreams.updateTimeout);
		
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.removeObserver(this.overlayObserver, 'tlstreams-overlay-update');
	};
	
	/* End load and unload methods */
	
	window.addEventListener("load", function () { tlstreams.onLoad(); }, false);
	window.addEventListener("unload", function() { tlstreams.onUnload(); }, false);
}).apply(tlstreams);