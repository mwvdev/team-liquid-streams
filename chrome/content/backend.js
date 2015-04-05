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

if (typeof(backend) == "undefined")
	var backend = {};

(function() {
	this.sortListPref = '';
	this.favourites = {};
	this.raceFilters = null;
	this.minQueryTime = 600000;
	this.manualTimeout = null;
	this.strings = null;
	this.typeFilter = null;
	this.typeList = ['All', 'SC2', 'BW', 'Misc'];
	this.userIdle = false;
	this.columnVisibility = {};
	this.initialized = false;
	
	this.initTableSorter = function() {
		$.tablesorter.addParser({
			id: 'simpleIMG',
			is: function(s) {
				return false;
			},
			format: function(s) {
				if (s == '1')
					return 1;
				else
					return 0;
			},
			type: 'numeric'
		});
		
		$.tablesorter.addParser({
			id: 'race',
			is: function(s) {
				return false;
			},
			format: function(s) {
				len = s.length;
				weights = {'Z': 1, 'T': 2, 'P': 3};
				if (len > 0) {
					weight = 0;
					for (i = 0; i < len; i++) {
						weight = weights[s[i]];
					}
					return weight * (len * 100);
				}
				else
					return -1;
			},
			type: 'numeric'
		});
	};
	
	this.clearContainer = function() {
		var container = document.getElementById('container');
		while (container.hasChildNodes())
			container.removeChild(container.lastChild);
		return container;
	};

	this.createTable = function() {
		if (backend.manualTimeout != null) {
			window.clearTimeout(backend.manualTimeout);
			backend.manualTimeout = null;
		}
			
		var container = this.clearContainer();
		
		var table = document.createElement('table');
		table.setAttribute('id', 'streamsTable');
		table.className = 'tablesorter';
		
		var tableHead = document.createElement('thead');
		var tableHeadRow = document.createElement('tr');
		var star = document.createElement('span');
		star.className = 'star favourite';
		star.setAttribute('title', this.strings.getString('Favourites'));
		
		createHeader = function( id, text ) {
			var header = document.createElement('th');
			header.setAttribute('id', id);
			header.appendChild(document.createTextNode(text));
			return header;
		};
		
		var favouriteHeader = document.createElement('th');
		favouriteHeader.appendChild(star);
		tableHeadRow.appendChild(favouriteHeader);		
		tableHeadRow.appendChild(createHeader('streamHeader', this.strings.getString('StreamHeader')));
		tableHeadRow.appendChild(createHeader('typeHeader', this.strings.getString('TypeHeader')));
		tableHeadRow.appendChild(createHeader('featuredHeader', this.strings.getString('FeaturedHeader')));
		tableHeadRow.appendChild(createHeader('raceHeader', this.strings.getString('RacesHeader')));
		tableHeadRow.appendChild(createHeader('viewersHeader', this.strings.getString('ViewersHeader')));
		
		tableHead.appendChild( tableHeadRow );
		table.appendChild(tableHead);
		
		var tableBody = document.createElement('tbody');
		table.appendChild(tableBody);
		
		container.appendChild(table);
		
		return tableBody;
	};
	
	this.printMessage = function(message) {
		var aConsoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		aConsoleService.logStringMessage(message);
	};
	
	this.translateText = function(text) {
		try {
			return backend.strings.getString(text);
		}
		catch (ex) {
			return text;
		}
	};
	
	this.typeFilterChanged = function(curType) {
		$('.stream').removeClass('hiddenType');
		if (curType != this.strings.getString('All')) {
			$('.stream').each(function() {
				try {
					streamType = $(this).attr('type');
					if (typeof(streamType) == 'undefined')
						return true; //continue the each loop
						
					if (backend.translateText(streamType) != curType) {
						$(this).addClass('hiddenType');
					}
				}
				catch (ex) {
					backend.printMessage('Error while filtering on type: ' + ex);
				}
			});
			
			backend.typeFilter = curType;
		}
		else
			backend.typeFilter = null;
			
		backend.makeZebra();
	};
	
	this.raceFilterChanged = function(curRace) {
		backend.raceFilters[curRace] = !backend.raceFilters[curRace];
		if (backend.raceFilters[curRace])
			$('#raceFilter' + curRace).attr('src', 'chrome://tlstreams/skin/' + curRace + 'off.png');
		else
			$('#raceFilter' + curRace).attr('src', 'chrome://tlstreams/skin/' + curRace + '.png');
	
		$('.stream').removeClass('hiddenRace');
		$('.stream').each(function() {
			var races = $(this).attr('races');
			var matches = true;
			var favourite = $('.favouriteElement', $(this)).hasClass('favourite');
			for (var race in backend.raceFilters) {
				if (!backend.raceFilters[race] && races.indexOf(race) != -1) {
					matches = false;
				}
			}
			
			if (matches && !favourite)
				$(this).addClass('hiddenRace');
		});
		
		backend.makeZebra();
		backend.storePreferences();
	};

	this.updateTable = function() {
		backend.loadPreferences();
		
		$("#streamsTable").tablesorter({
		sortList: backend.sortListPref,
		headers: {	0: { sorter:'simpleIMG'},
					1: { sorter:'text' },
					2: { sorter:'text' },
					3: { sorter:'simpleIMG' },
					4: { sorter:'race' },
					5: { sorter:'digit' }
			}
		});
		
		$("#streamsTable").bind("sortEnd", function() { 
			backend.storePreferences();
			backend.makeZebra();
		});
		
		var typeFilter = document.createElement('select');
		for (var i = 0; i < backend.typeList.length; i++) {
			var curType = backend.typeList[i];
			var curTypeText = backend.translateText(curType);
			var newTypeList = document.createElement('option');
			newTypeList.appendChild(document.createTextNode(curType));
			if (backend.typeFilter != null && curTypeText == backend.typeFilter) {
				newTypeList.setAttribute('selected', 'selected');
			}
			typeFilter.appendChild(newTypeList);
		}
		
		typeFilter.setAttribute('id', 'typeFilter');
		typeFilter.addEventListener('change', function() {
			backend.typeFilterChanged($('option:selected', this).text());
		});
		
		var raceFilter = document.createElement('span');
		raceFilter.setAttribute('id', 'raceFilter');
		
		function addRace(race, row) {
			var newRace = document.createElement('img');
			newRace.setAttribute('id', 'raceFilter' + race);
			newRace.setAttribute('race', race);
			newRace.className = race;
			
			if (!backend.raceFilters[race])
				newRace.setAttribute('src', 'chrome://tlstreams/skin/' + race + '.png');
			else
				newRace.setAttribute('src', 'chrome://tlstreams/skin/' + race + 'off.png');
			
			newRace.addEventListener('click', function() {
				backend.raceFilterChanged($(this).attr('race'));
			});
			raceFilter.appendChild(newRace);
		}
		
		addRace('Z', raceFilter);
		addRace('T', raceFilter);
		addRace('P', raceFilter);
		
		var tableHeadRow = document.createElement('tr');
		tableHeadRow.appendChild(document.createElement('th'));
		tableHeadRow.appendChild(document.createElement('th'));
		
		var typeFilterCell = document.createElement('th');
		typeFilterCell.appendChild(typeFilter);
		
		tableHeadRow.appendChild(typeFilterCell);
		tableHeadRow.appendChild(document.createElement('th'));
		
		var raceFilterCell = document.createElement('th');
		raceFilterCell.setAttribute('id', 'headerRaceFilter');
		raceFilterCell.appendChild(raceFilter);
		
		tableHeadRow.appendChild(raceFilterCell);
		
		var buttonCell = document.createElement('th');
		var refreshButton = backend.makeRefreshButton();
		buttonCell.appendChild(refreshButton);
		
		tableHeadRow.appendChild(buttonCell);
		
		$('#streamsTable > thead:last').append(tableHeadRow);
	};
	
	this.manualRefresh = function() {
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		streamBackend.manualRefresh();
	};
	
	this.makeRefreshButton = function() {
		var refreshButton = document.createElement('button');
		refreshButton.appendChild(document.createTextNode(this.strings.getString('Refresh')));
		refreshButton.setAttribute('id', 'refreshButton');
		refreshButton.addEventListener('click', function() {
			backend.manualRefresh();
			
			this.setAttribute('disabled', 'disabled')
			this.className = 'disabled';
		});
		
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		var elapsedManual = (new Date()) - streamBackend.getLastManualUpdate();
		if (elapsedManual < backend.minQueryTime) {
			refreshButton.setAttribute('disabled', 'disabled')
			refreshButton.className = 'disabled';
		}
		
		backend.manualTimeout = window.setTimeout(function() {
			var refreshButton = document.getElementById('refreshButton');
			if(refreshButton != null)
			{
				refreshButton.removeAttribute('disabled')
				refreshButton.className = '';
			}
		}, backend.minQueryTime - elapsedManual);
		return refreshButton;
	};

	this.loadPreferences = function() {
		function loadJSON(resource) {
			var tmp = nsPreferences.copyUnicharPref(resource);
			var parsed = '';
			if (tmp.length > 0)
				parsed = $.parseJSON(tmp);
			return parsed;
		}
		
		backend.sortListPref = loadJSON('extensions.tlstreams.sortList');
		backend.favourites = loadJSON('extensions.tlstreams.favourites');
		backend.raceFilters = loadJSON('extensions.tlstreams.raceFilters');
		
		backend.columnVisibility = {'favouriteHeader': nsPreferences.getBoolPref('extensions.tlstreams.columns.showFavourites'),
									'streamHeader': nsPreferences.getBoolPref('extensions.tlstreams.columns.showStreams'),
									'typeHeader': nsPreferences.getBoolPref('extensions.tlstreams.columns.showTypes'),
									'featuredHeader': nsPreferences.getBoolPref('extensions.tlstreams.columns.showFeatured'),
									'raceHeader': nsPreferences.getBoolPref('extensions.tlstreams.columns.showRaces'),
									'viewersHeader': nsPreferences.getBoolPref('extensions.tlstreams.columns.showViewers')};
	};

	this.storePreferences = function() {
		backend.sortListPref = JSON.stringify($('#streamsTable').get(0).config.sortList);
		nsPreferences.setUnicharPref('extensions.tlstreams.sortList', backend.sortListPref);
		
		favouritesJSON = JSON.stringify(backend.favourites);
		nsPreferences.setUnicharPref('extensions.tlstreams.favourites', favouritesJSON);
		
		raceFiltersJSON = JSON.stringify(backend.raceFilters);
		nsPreferences.setUnicharPref('extensions.tlstreams.raceFilters', raceFiltersJSON);
		
		var prefService = Components.classes["@mozilla.org/preferences-service;1"]
								   .getService(Components.interfaces.nsIPrefService);
		prefService.savePrefFile(null);
	},
	
	this.updateStreams = function() {
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		var xml = streamBackend.getXML();
		if (!xml)
			return;
	
		tableBody = backend.createTable();
		
		var streams = xml.getElementsByTagName('stream');
		for(var i = 0; i < streams.length; i++) {
			var stream = streams[i];
			backend.addStream(xml, stream, tableBody);
		}
		
		backend.updateTable();
		
		i = 1;
		for (column in backend.columnVisibility) {
			if (!backend.columnVisibility[column]) {
				$('td:nth-child(' + i + '),th:nth-child(' + i + ')').hide();
			}
			i++;
		}
	};
	
	this.makeZebra = function() {
		$("table tr:visible:even").removeClass("odd");
		$("table tr:visible:odd").addClass("odd");
	};
	
	this.toggleFavourite = function(favourite) {
		$(favourite).toggleClass('favourite');
		var favoured = $(favourite).hasClass('favourite');
		var owner = $(favourite).attr('owner');
		backend.favourites[owner] = favoured;
		var starFix = $('.favouriteFix', $(favourite).parent());
		if (!favoured) {
			starFix.text('');
			delete backend.favourites[owner];
		}
		else {
			starFix.text('1');
		}
		
		backend.storePreferences();
		backend.updateStreams();
		
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		streamBackend.favouritesChanged();
	};

	this.addStream = function(xml, stream, tableBody) {
		try {
			var featuredStream = stream.getAttribute('featured') == '1';
			var owner = stream.getAttribute('owner');
			var channelName = stream.getAttribute('title');
			var streamType = stream.getAttribute('type');
			var featuredHeaderVisible = backend.columnVisibility['featuredHeader'];
			var channel = stream.getElementsByTagName('channel');
			var channelName = owner;
			if (channel.length > 0)
				channelName = channel[0].getAttribute('title');
				
			var featuredHeaderVisible = backend.columnVisibility['featuredHeader'];

			var raceText = stream.getAttribute('race');
			if (raceText == null)
				raceText = 'TZP';
			
			var row = document.createElement('tr');
			row.className = 'stream';
			row.setAttribute('type', streamType);
			row.setAttribute('races', raceText);
			
			//favourite cell
			var favouriteElement = document.createElement('td');
			favouriteElement.className = 'favouriteElement';
			var starFix = document.createElement('span');
			starFix.className = 'hidden favouriteFix';
			var star = document.createElement('span');
			star.className = 'star';
			star.setAttribute('title', "Alert me when " + channelName + " begins streaming");
			star.setAttribute('owner', owner);
			
			var favourite = false;
			if (owner in backend.favourites)
				favourite = backend.favourites[owner];
			if (favourite) {
				star.className += " favourite";
				favouriteElement.className += " favourite";
				starFix.appendChild(document.createTextNode( '1' ));
			}
			
			star.addEventListener('click', function() {
				backend.toggleFavourite(this);
			});
			
			favouriteElement.appendChild(starFix);
			favouriteElement.appendChild(star);
			row.appendChild(favouriteElement);
			
			//stream cell
			var link = xml.evaluate("link[@type='embed']", stream, null, XPathResult.ANY_UNORDERED_NODE_TYPE, null).singleNodeValue.textContent;
			
			var ownerHtml = document.createElement('a');
			ownerHtml.setAttribute('target', '_blank');
			ownerHtml.setAttribute('href', link);
			ownerHtml.appendChild(document.createTextNode(channelName));
			if (!featuredHeaderVisible && featuredStream) {
				var featuredImg = document.createElement('img');
				featuredImg.setAttribute('src', 'chrome://tlstreams/skin/featured.gif');
				ownerHtml.appendChild(featuredImg);
			}

			var streamCell = document.createElement('td');
			streamCell.className = 'streamCell';
			streamCell.appendChild(ownerHtml);
			row.appendChild(streamCell);

			//type cell
			var typeCell = document.createElement('td');
			typeCell.appendChild(document.createTextNode(streamType));
			typeCell.className = 'type';
			row.appendChild(typeCell);
			
			//check whether the stream type belongs to the list of stream types that are translated
			if (backend.typeList.indexOf(streamType) == -1) {
				//if it is not, add it to the list under its current name
				backend.typeList.push(streamType);
			}
			
			//featured cell
			var featuredCell = document.createElement('td');
			var featuredHtml = document.createElement('span');
			featuredHtml.className = 'featured';
			var featuredFix = document.createElement('span');
			featuredFix.className = 'hidden';
				
			if (featuredStream) {
				featuredFix.appendChild(document.createTextNode('1'));
				featuredCell.appendChild(featuredFix);
				featuredCell.appendChild(featuredHtml);
				featuredCell.className += ' featured';
			}
			else {
				featuredCell.appendChild(featuredFix);
			}
			
			row.appendChild(featuredCell);
				
			//races cell		
			var raceHtml = document.createElement('span');
			raceHtml.className = 'races';
			var numRaces = raceText.length;
			for (i = 0; i < numRaces; ++i) {
				var raceImg = document.createElement('img');
				raceImg.setAttribute('src', 'chrome://tlstreams/skin/' + raceText[i] + '.png');
				raceHtml.appendChild(raceImg);
			}

			var raceFix = document.createElement('span');
			raceFix.className = 'hidden';
			raceFix.appendChild(document.createTextNode(raceText));
			var raceCell = document.createElement('td');
			raceCell.className = 'race';
			raceCell.appendChild(raceFix);
			raceCell.appendChild(raceHtml);
			row.appendChild(raceCell);			
			
			//viewer cell
			var viewerCount = stream.getAttribute('viewers');
			if (viewerCount == '' || typeof viewerCount == 'undefined' || viewerCount == false || viewerCount == null)
				viewerCount = 'N/A';
			
			var viewersCell = document.createElement('td');
			viewersCell.appendChild(document.createTextNode(viewerCount));
			viewersCell.className = 'viewers';
			row.appendChild(viewersCell);
			
			//apply visibility filtering
			if (backend.typeFilter != null) {
				if (backend.typeFilter != backend.translateText(streamType))
					row.className += " " + hiddenType;
			}
			var matches = true;
			for (var race in backend.raceFilters) {
				if (!backend.raceFilters[race] && raceText.indexOf(race) != -1) {
					matches = false;
				}
			}
			if (matches && !favourite)
				row.className += 'hiddenRace';
			
			tableBody.appendChild(row);
		}
		catch (ex) {
			backend.printMessage('Error while parsing stream: ' + ex);
		}
	};
	
	this.initialize = function(strings) {
		backend.strings = strings;
		backend.initialized = true;
		
		$('#legendTerran').text(this.strings.getString('Terran'));
		$('#legendProtoss').text(this.strings.getString('Protoss'));
		$('#legendZerg').text(this.strings.getString('Zerg'));
		$('#legendFeatured').text(this.strings.getString('Featured'));
		$('#legend').show();
		
		backend.initDisplay();
	};
	
	this.displayError = function(data) {
		var status = data[0];
		var thrownError = data[1];
		
		var container = this.clearContainer();
		
		var divErrorMessage = this.strings.getString('UpdateFailure');
		var errorDescription = '';
		if (status >= 400 && status < 500)
			errorDescription += this.strings.getString('ErrorCode') + ' ' + status + ': ' + backend.strings.getString('ExtensionDisabled');
		else if (thrownError && status != 0)
			errorDescription += this.strings.getString('ErrorCode') + ' ' + status + ': ' + thrownError;
		else if (status != 0)
			errorDescription += ' (' + this.strings.getString('ErrorCode') + ' ' + status + ')';
		
		var divError = document.createElement('div');
		divError.className = 'hidden';
		
		var divErrorLeft = document.createElement('div');
		divErrorLeft.className = 'loadingError';
		
		var logoImg = document.createElement('img');
		logoImg.setAttribute('src', 'chrome://tlstreams/skin/icon60px.png');
		divErrorLeft.appendChild(logoImg);
		
		var divErrorTitle = document.createElement('div');
		divErrorTitle.className = 'loadingErrorText';
		divErrorTitle.innerHTML = divErrorMessage;
		
		var divErrorDescription = document.createElement('div');
		divErrorDescription.className = 'errorDescription';
		divErrorDescription.appendChild(document.createTextNode(errorDescription));
		
		if (!(status >= 400 && status < 500)) {
			var refreshButton = backend.makeRefreshButton();
			refreshButton.className += " error";
			var buttonContainer = document.createElement('div');
			buttonContainer.appendChild(refreshButton);
			divErrorLeft.appendChild(buttonContainer);
		}
		
		divError.appendChild(divErrorLeft);
		divError.appendChild(divErrorTitle);
		divError.appendChild(divErrorDescription);
		container.appendChild(divError);
		$(divError).fadeIn(1000);
	};
	
	this.displayUpdating = function() {
		var container = this.clearContainer();
		
		var divError = document.createElement('div');
		divError.className = 'hidden';
		
		var divErrorLeft = document.createElement('div');
		divErrorLeft.className = 'loadingError';
		
		var logoImg = document.createElement('img');
		logoImg.setAttribute('src', 'chrome://tlstreams/skin/icon60px.png');
		divErrorLeft.appendChild(logoImg);
		
		var divErrorSpan = document.createElement('div');
		divErrorSpan.className = 'loadingErrorText';
		divErrorSpan.appendChild(document.createTextNode(this.strings.getString('Updating')));
		
		if (!(status >= 400 && status < 500)) {
			var refreshButton = backend.makeRefreshButton();
			refreshButton.className += " error";
			var buttonContainer = document.createElement('div');
			buttonContainer.appendChild(refreshButton);
			divErrorLeft.appendChild(buttonContainer);
		}
		
		divError.appendChild(divErrorLeft);
		divError.appendChild(divErrorSpan);
		container.appendChild(divError);
		$(divError).fadeIn(1000);
	};
	
	this.initDisplay = function() {
		var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
		var xml = streamBackend.getXML();
		
		if (streamBackend.serverError) {
			var data = [streamBackend.serverStatus, streamBackend.serverStatusText];
			backend.displayError(data);
		}
		else if (streamBackend.updating && xml == null)
			backend.displayUpdating();
		else
			backend.updateStreams();
	};
	
	this.updateObserver = {
		observe: function(subject, topic, data) {
			if (topic == "tlstreams-sidebar-update") {
				var streamBackend = Components.classes['@teamliquid.streams.for.firefox/streambackend;1'].getService().wrappedJSObject;
				switch (data) {
					case '1':
						backend.loadPreferences();
						backend.updateStreams();
					break;
					case '2':
						var data = [streamBackend.serverStatus, streamBackend.serverStatusText];
						backend.displayError(data);
					break;
				}
			}
		}
	};
	
	this.initObserver = function() {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(this.updateObserver, 'tlstreams-sidebar-update', false);
	};
	
	this.onLoad = function() {
		backend.loadPreferences();
		backend.initTableSorter();
		backend.initObserver();
	};
	
	this.onUnload = function() {
		if (backend.manualTimeout != null)
			window.clearTimeout(backend.manualTimeout);
		
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.removeObserver(backend.updateObserver, 'tlstreams-sidebar-update');
	};
	
	this.performanceTest = function() {
		var repeatCount = 100;
		var completionTimes = Array();
		
		for(var i = 0; i < repeatCount; i++) {
			var startTime = Date.now();
			
			this.updateStreams();
			
			var endTime = Date.now();
			var delta = endTime - startTime;
			completionTimes.push(delta);
		}
		
		average = 0;
		for(var i = 0; i < repeatCount; i++) {
			average += completionTimes[i];
		}
		average /= repeatCount;
		
		alert( 'Average time taken: ' + average );
	};
	
}).apply(backend);

$(document).ready(function() {
	backend.onLoad();
});

$(window).unload(function() {
	backend.onUnload();
});