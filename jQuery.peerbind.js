//
//    Copyright 2011 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//
//    Licensed under the Amazon Software License (the "License"). You may 
//    not use this file except in compliance with the License. A copy of
//    the License is located at
//
//    http://aws.amazon.com/asl/
//
//    or in the license file accompanying this file. This file is 
//    distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS 
//    OF ANY KIND, express or implied. See the License for the specific 
//    language governing permissions and limitations under the License. 
//
(function ($) {
	//This allows you to listen to only one triggering of an event. 
	$.fn.peerone = function (type, data, fn) {
		return this.peerbind(type, data, fn, true);
	};

	/*
        The magic happens here.  This signs up an event for listening, starts 
        the registration, and kicks off polling.
         type: The name of the event type you want to listen in on.
         data: Optional data to get back when the event fires.
         fn: The call back that should happen when it fires.
         isOnce: Listen only once to the fired event.
         
         Note: There is a convienience feature where you can include an 
         object in the data slot for local(fn), peer(fn), and data. Where
         local and peer are handler functions. 
    */
	$.fn.peerbind = function ( /*optional settings,*/ type, data, fn, isOnce) {
		//Check to see if there are settings...
		if (type && jQuery.isPlainObject(type)) {
			//Yup set them and return.
			$.extend(true, $.fn.peerbind.defaults, type);
			if (type.endpointprefixes && type.endpointprefixes instanceof Array) {
				$.fn.peerbind.defaults.endpointprefixes = type.endpointprefixes;
			}

			//Move the parameter stack along...
			type = data;
			data = fn;
			fn = isOnce;
			if (arguments.length == 5) isOnce = arguments[4];
		}

		//Specialized handlers that are called only when events are
		//src'd accordingly.
		var localHandler = null;
		var peerHandler = null;

		function postPeerEvent(e, selector) {
			if (!$.fn.peerbind.state.registered) {
				var oldCallback = $.fn.peerbind.defaults.regcallback;
				$.fn.peerbind.defaults.regcallback = (function (e, selector, oldCallback) {
					return (function () {
						postPeerEvent(e, selector);
						if (jQuery.isFunction(oldCallback)) oldCallback();
					});
				})(e, selector, oldCallback);
				return;
			}

			//Check to see if there are multiple selectors...
			if (selector.match(/,/)) {
				//its multi.  Find the one we want.
				//A.k.a. The fewest elements which
				//we are in.
				var selectors = selector.split(/,/);
				var len = 20000;
				var winningSelector = null;
				for (var i = 0; i < selectors.length; i++) {
					var elems = jQuery(selectors[i]);
					if ($.inArray(e.target, elems) >= 0) {
						if (elems.length < len) {
							len = elems.length;
							winningSelector = selectors[i];
						}
					}
				}

				if (winningSelector != null) {
					selector = winningSelector;
				}
			}

			var matchElems = jQuery(selector);
			if (matchElems.length > 1) {
				for (var i = 0; i < matchElems.length; i++) {
					if (e.target == matchElems[i]) {
						selector = selector + ":eq(" + i + ")";
						break;
					}
				}
			}

			var peerData = e.peerData;
			if (e.peerData instanceof Array) peerData = '["' + e.peerData.join('-==-,-==-').replace(/"/g, '\\"').replace(/-==-/g, '"') + '"]';

			var eventObjectString = '{"src":"' + $.fn.peerbind.defaults.uuid + '","s":"' + selector + '","t":"' + e.type + (e.keyCode ? '","k":"' + e.keyCode : '') + (e.charCode ? '","c":"' + e.charCode : '') + (e.pageX ? '","px":"' + e.pageX + '","py":"' + e.pageY : '') + '","d":"' + encodeURIComponent((peerData ? peerData : '')).replace(/"/g, '\\"') + (e.bundleData ? '","b":"' + e.bundleData.replace(/"/g, '\\"') : '') + '","o":"' + new Date().getTime() + '"}';

			//This code handles making sure the post go out.
			//Count the posts made.
			$.fn.peerbind.state.postcalls++;

			//Create a function name out of it for the closure
			var funcName = "peerbindPost" + $.fn.peerbind.state.postcalls;

			//The closure that handles the housekeeping for the
			//callback.
			$.fn.peerbind[funcName] = (function (funcName) {
				return (function (data) {
					//Clear this call back.
					$.fn.peerbind.state.callswaiting[funcName] = null;
					clearInterval($.fn.peerbind.state.callintervals[funcName]);
					$.fn.peerbind.state.callintervals[funcName] = null;

					//Clear the closure so we only handle the reponse once.
					$.fn.peerbind[funcName] = function () {};

					//The final posting of the response to the rest of the system.
					jQuery.fn.peerbind.peerbindPost(data);
				});
			})(funcName);

			//note the reference to the closure function in this url.
			var url = 'http://' + $.fn.peerbind.peerbindGetEndpoint() + '/post/?f=$.fn.peerbind.' + funcName + '&g=' + $.fn.peerbind.defaults.uuid + '&t=' + $.fn.peerbind.defaults.type + '&e=' + encodeURIComponent(eventObjectString) + "&_t=" + (new Date().getTime()) + "&d=" + $.fn.peerbind.defaults.regstring;

			//See if they need to provide a referer.
			if ($.fn.peerbind.defaults.referer) {
				url += "&u=" + $.fn.peerbind.defaults.referer;
			}

			//Check to see if this is a directed event. Directed events let you target
			//a specific queue.
			if (e.peerTarget) url += '&q=' + encodeURIComponent(e.peerTarget);


			//Finally send along the post.
			$.fn.peerbind.ajax({
				url: url,
				dataType: "script"
			});

			//Create the object encapsulating the data needed to re-send the post.
			$.fn.peerbind.state.callswaiting[funcName] = {
				f: $.fn.peerbind[funcName],
				u: url
			};

			//Record an interval so that we can check to see if the post ever finally
			//made it.  We know its gone out the door when the function object
			//is null for this function name.
			$.fn.peerbind.state.callintervals[funcName] = setInterval((function (fn) {
				return (function () {
					//Grab the data object out by function name.
					var fObject = $.fn.peerbind.state.callswaiting[fn];
					if (fObject != null) {
						//Re-send.
						$.fn.peerbind.ajax({
							url: fObject.u,
							dataType: "script"
						});
					}
				});
			})(funcName), 2000);
		} //End post event.
		$.fn.peerbind.registerDevice(true);

		//Check to see if the parameter mungin is necessary.
		if (jQuery.isFunction(data)) {
			fn = data;
			data = undefined;
		} //Now check to see if they used the conveinience object.
		else if (data != null && (data["local"] || data["peer"] || data["data"])) {
			localHandler = data["local"];
			peerHandler = data["peer"];
			data = data["data"];
		}

		var sel = this.selector;
		if (!sel || sel == "") {
			//Try a little harder to find a selector that 
			//will work.
			if (this[0] == document) {
				sel = "document";
			} else if (this[0] == window) {
				sel = "window";
			} else {
				var elem = this[0];
				var selectorString = "";
				if ($(elem).attr("id") != null && $(elem).attr("id") != "") {
					sel = "#" + $(elem).attr("id");
				} else if (elem.className && elem.className != "") {
					//Get all of this class and count it.
					var elementsOfClass = jQuery("." + elem.className);
					for (var i = 0; i < elementsOfClass.length; i++) {
						if (elementsOfClass[i] == elem) {
							sel = "." + elem.className + ":eq(" + i + ")";
							break;
						}
					}
				} else {
					//Get all of this type of element and find it
					// in the list.  We come from the same page
					//so this should
					var elementsOfNode = jQuery((elem.tagName + "").toLowerCase());
					for (var i = 0; i < elementsOfNode.length; i++) {
						if (elementsOfNode[i] == elem) {
							sel = (elem.tagName + "").toLowerCase() + ":eq(" + i + ")";
							break;
						}
					}
				}
			}
		}

		function postBundleEvents(bundle, sel, srcElem, type) {
			var bundleString = "[";
			for (var i = 0; i < bundle.length; i++) {
				var e = bundle[i];
				//This is the mouse down.
				if (i == 0) {} else {
					bundleString += ",";
				}

				bundleString += '{"x":' + e.x + ',"y":' + e.y + (e.lx ? ',"lx":' + e.lx + ',"ly":' + e.ly : '') + (e.ex ? ',"ex":' + e.ex + ',"ey":' + e.ey : '') + ',"t":' + e.t + '}';

				//This is the mouse up.
				if (i == (bundle.length - 1)) {
					bundleString += "]";
					//Finish and post
					var eventObj = {
						type: type,
						bundleData: bundleString
					};

					eventObj.target = srcElem;
					postPeerEvent(eventObj, sel);
				}
			}
		}

		this.each(function () {
			//Run through each type of event provided.
			var types = type.split(/ /);
			for (var typeCt = 0; typeCt < types.length; typeCt++) {
				var curType = types[typeCt];

				//Mark this is "bound"
				$(this).data("peerbound" + curType, "1");
				if (curType == "mousebundle" || curType == "mousewatch") {
					var eventBundleWatch = function (e) {
						var moveEvents = [];
						var lastTime = 0;

						moveEvents[moveEvents.length] = {
							x: e.pageX,
							y: e.pageY,
							lx: e.pageX - $(this).offset().left,
							ly: e.pageY - $(this).offset().top,
							ex: $(this).offset().left,
							ey: $(this).offset().top,
							t: new Date().getTime()
						};

						var moveFunc = (function (moveArray, lastTime) {
							return (function (e) {
								if (new Date().getTime() - lastTime > 50) {
									lastTime = new Date().getTime();
									moveArray[moveArray.length] = {
										x: e.pageX,
										y: e.pageY,
										t: lastTime
									};
								}
							});
						})(moveEvents, lastTime);

						$(this).mousemove(moveFunc);

						$("body").one("mouseup.pbindbundle", (function (moveArray, scope, moveFunc, sel, type) {
							return (function (e) {
								$(scope).unbind("mousemove", moveFunc);
								moveArray[moveArray.length] = {
									x: e.pageX,
									y: e.pageY,
									ex: $(e.target).css("left").replace(/px/, "") - 0,
									ey: $(e.target).css("top").replace(/px/, "") - 0,
									t: new Date().getTime()
								};


								postBundleEvents(moveArray, sel, scope, type);
							});
						})(moveEvents, this, moveFunc, sel, curType));
					}

					if (curType == "mousebundle") {
						//This is a special type of event where we bundle up the important
						//bits.
						$(this).bind("mousedown.pbindbundle", eventBundleWatch);
					} else if (curType == "mousewatch") {
						$(document.body).one("mousemove.pbindbundle", eventBundleWatch);
						$(document.body).one("mousewatchend.pbindbundle", function () {
							$(document.body).trigger("mouseup.pbindbundle");
						});
					}
				}

				$(this).bind(curType + ".pbind", data, (function (scope, fn, sel, isOnce, localHandler, peerHandler) {
					return (function (event) {
						if (!event.peerData && !event.data && event.type == 'change') {
							event.peerData = $(event.currentTarget).val();
						}

						if (!event.peerData && event.data && event.data.length) {
							event.peerData = event.data.join(",");
						}

						if (!event.srcPeer) postPeerEvent(event, sel);

						event.currentTarget = scope;

						if (isOnce) {
							$(this).unbind(event.type + ".pbind", arguments.callee);
						}

						var returnVal = null;
						if (!event.srcPeer && localHandler) {
							returnVal = localHandler.apply(scope, arguments);
						} else if (event.srcPeer && peerHandler) {
							returnVal = peerHandler.apply(scope, arguments);
						}

						if (fn) returnVal = fn.apply(scope, arguments);

						return returnVal;
					});
				})(this, fn, sel, isOnce, localHandler, peerHandler));
			}
		});

		return this;
	};

	$.fn.peerbind.eventWatcher = function () {
		if (!$.fn.peerbind.state.registered) {
			return;
		}

		//If the last event request was more than 5 seconds old then do another.
		//Note we clear the timestamp when a response is received.
		if (new Date().getTime() - $.fn.peerbind.state.pollstart > $.fn.peerbind.defaults.pollmax) {
			clearTimeout($.fn.peerbind.state.polltimeout);
			$.fn.peerbind.state.polltimeout = null;

			$.fn.peerbind.state.pollstart = new Date().getTime();

			var url = 'http://' + $.fn.peerbind.peerbindGetEndpoint() + '/poll/?f=jQuery.fn.peerbind.peerbindTrigger&g=' + $.fn.peerbind.defaults.uuid + '&w=' + ($.fn.peerbind.defaults.pollmax - 1000) + '&t=' + $.fn.peerbind.defaults.type + "&_t=" + (new Date().getTime()) + "&d=" + $.fn.peerbind.defaults.regstring;

			//See if they need to provide a referer.
			if ($.fn.peerbind.defaults.referer) {
				url += "&u=" + $.fn.peerbind.defaults.referer;
			}

			$.fn.peerbind.ajax({
				url: url,
				dataType: "script"
			});
		}
	}

	$.fn.peerbind.dupEvent = function (eventObj) {
		var triggeredEvents = $.fn.peerbind.state.triggeredevents;

		var duplicate = false;
		if (!triggeredEvents[eventObj.src]) {
			triggeredEvents[eventObj.src] = [];
		}

		for (var i = 0; i < triggeredEvents[eventObj.src].length; i++) {
			var oldEvent = triggeredEvents[eventObj.src][i];
			if (oldEvent.t == eventObj.t && oldEvent.o == eventObj.o && oldEvent.px == eventObj.px && oldEvent.py == eventObj.py && oldEvent.k == eventObj.k) {
				duplicate = true;
				break;
			}
		}

		if (!duplicate) {
			var sourcedEvents = triggeredEvents[eventObj.src];
			triggeredEvents[eventObj.src][sourcedEvents.length] = eventObj;
			$.fn.peerbind.state.triggeredevents = triggeredEvents;

			clearTimeout($.fn.peerbind.state.triggereclean);
			$.fn.peerbind.state.triggereclean = setTimeout($.fn.peerbind.triggerClean, 30000);
		}

		return duplicate;
	}

	$.fn.peerbind.triggerClean = function () {
		var triggeredEvents = $.fn.peerbind.state.triggeredevents;
		var now = new Date().getTime();

		for (var srcName in triggeredEvents) {
			var newECollection = [];
			for (var i = 0; i < triggeredEvents[srcName].length; i++) {
				var eventObj = triggeredEvents[srcName][i];
				if (now - eventObj.o < 30000) {
					newECollection[newECollection] = eventObj;
				}
			}

			triggeredEvents[srcName] = newECollection;
		}

		$.fn.peerbind.state.triggeredevents = triggeredEvents;
	}


	$.fn.peerbind.peerbindTrigger = function (data, delay) {

		if (delay == 0) {
			$.fn.peerbind.state.pollstart = null;
			if ($.fn.peerbind.state.polltimeout == null) $.fn.peerbind.state.polltimeout = setTimeout($.fn.peerbind.eventWatcher, 10);
		} else {
			$.fn.peerbind.defaults.pollmax = delay * 10000;
		}

		//Deal with this data. 
		if (!data || data.length == 0) return;

		//Trigger events. 
		for (var i = 0; i < data.length; i++) {
			var eventObj = data[i];
			if (eventObj && eventObj.src != $.fn.peerbind.defaults.uuid && !$.fn.peerbind.dupEvent(eventObj)) {
				var triggerTarget = eventObj.s;
				if (triggerTarget == "document") {
					triggerTarget = document;
				} else if (triggerTarget == "window") {
					triggerTarget = window;
				}

				var e = new jQuery.Event(eventObj.t);
				e.target = $(triggerTarget)[0];
				e.pageX = eventObj.px;
				e.pageY = eventObj.py;
				e.keyCode = (eventObj.k ? eventObj.k - 0 : null);
				e.charCode = (eventObj.c ? eventObj.c - 0 : null);
				e.srcPeer = eventObj.src;

				//Check to see if this peer is blacklisted.
				if ($.fn.peerbind.blacklist[e.srcPeer]) continue;

				e.peerData = decodeURIComponent(eventObj.d);
				if (e.peerData.match(/^\[/)) {
					//Clean it.
					e.peerData = e.peerData.replace(/\(/g, '');

					//Then eval the array.
					try {
						e.peerData = $.parseJSON(e.peerData);
					} catch (ex) {}
				}

				e.bundleData = eventObj.b;
				if (e.bundleData) {
					e.bundleData = e.bundleData.replace(/\(/g, '');
					//Then eval the array.
					try {
						e.bundleData = jQuery.parseJSON(e.bundleData);
					} catch (ex) {}
				}

				$(triggerTarget).trigger(e);
			}
		}
	};

	$.fn.peerbundleplay = function (eventObj) {
		this.each(function () {
			var curTime = 0;
			var startPos = null;
			for (var i = 0; i < eventObj.bundleData.length; i++) {
				var bundle = eventObj.bundleData;
				if (i == 0) {
					curTime = bundle[i].t;
					$(this).css({
						left: bundle[i].ex,
						top: bundle[i].ey
					});
					startPos = {
						x: bundle[i].lx,
						y: bundle[i].ly
					};
				} else {
					if (startPos) {
						if (bundle[i]["ex"]) $(this).animate({
							left: bundle[i].ex,
							top: bundle[i].ey
						}, bundle[i].t - curTime);
						else $(this).animate({
							left: bundle[i].x - startPos.x,
							top: bundle[i].y - startPos.y
						}, bundle[i].t - curTime);
					} else if (bundle[i]["ex"]) $(this).animate({
						left: bundle[i].ex,
						top: bundle[i].ey
					}, bundle[i].t - curTime);
					else $(this).animate({
						left: bundle[i].x,
						top: bundle[i].y
					}, bundle[i].t - curTime);

					curTime = bundle[i].t;
				}
			}
		});

		return this;
	}

	/*
	 * set the state of the local peer to unregistered to allow re-registering
	 * 
	 * todo: create a server function allowing cleanup server side
	 *  
	 */
	$.fn.peerbind.deregister = function(reset){
		if ($.fn.peerbind.state.registered){
			$.fn.peerbind.state.registered = false;
			
			//reset the peer id?
			if (!reset){
				//nothin
			} else if (localStorage && localStorage["peeruuid"] && localStorage.peeruuid != "") {
				localStorage.peeruuid = "";//release uuid from localStorage, allowing regeneration on reregistering
			}
		}
	}
	
	/*
	 * reregister with the server
	 *
	 */
	$.fn.peerbind.reregister = function(){
		$.fn.peerbind.deregister(true);
		$.fn.peerbind.registerDevice(true);
	}

	$.fn.peerbind.registerDevice = function (multipleTriesExpected) {
		if ($.fn.peerbind.state.registered) {
			if (!multipleTriesExpected) $.fn.peererror("Attempting to register when we are already registered. Clear the 'registered' field in the state object.");
			return;
		}

		if ($.fn.peerbind.state.registering) {
			if (!multipleTriesExpected) $.fn.peererror("Attempting to register while an attempt is in progress.");
			return;
		}

		//Pull in the black lists.  Black list files should look like:
		/*
        $.fn.peerbind.blacklist = {
            "guid1":1,
            "guid2":1,
            "guid3":1
            .
            .
            .
        } 
        */

		//Note: The code expects either/or.  If there is a blacklist on 
		//both - its a race condition.
		//Pull the blacklist for this domain - if there is one:
		setTimeout(function () {
			try {
				$.fn.peerbind.ajax({
					url: "http://" + document.location.host + "/peerbind.blacklist.js",
					dataType: "script"
				});
			} catch (ex) {}
		}, 100);

		//And load the one for this page if there is one.
		setTimeout(function () {
			try {
				$.fn.peerbind.ajax({
					url: (document.location.href + "").replace(/(.*)\/[^\/]*/, "$1/peerbind.blacklist.js"),
					dataType: "script"
				});
			} catch (ex) {}
		}, 100);

		$.fn.peerbind.state.registering = true;
		$.fn.peerbind.registerUUID($.fn.peerbind.establishUUID());
	}

	$.fn.peerbind.establishUUID = function () {

		if (localStorage && localStorage["peeruuid"] && localStorage.peeruuid != "") {
			$.fn.peerbind.defaults.uuid = localStorage.peeruuid;
		} else if ($.fn.peerbind.defaults.uuid) {
		//Nop.
		} else {
			var seed1 = (new Date()).getTime() + Math.floor(Math.random() * 10000);
			var seed2 = (new Date()).getTime();
			var seed3 = (new Date()).getTime() + Math.floor(Math.random() * 100000);

			var prefix = Math.floor(Math.random(seed1 * 100) * 10000000);
			var suffix = Math.floor(Math.random(seed2 * 100) * 10000000);
			var suffix2 = Math.floor(Math.random(seed3 * 100) * 10000000);

			var uuid = prefix + "-" + suffix + "-" + suffix2;

			if (localStorage) {
				localStorage.peeruuid = uuid;
			}

			$.fn.peerbind.defaults.uuid = uuid;
		}

		return $.fn.peerbind.defaults.uuid;
	}


	$.fn.peerbind.registerUUID = function (uuid) {

		function handleRegistration() {
			var type = $.fn.peerbind.defaults.type;

			var url = 'http://' + $.fn.peerbind.peerbindGetEndpoint() + '/register/?f=jQuery.fn.peerbind.peerbindRegister&g=' + uuid + '&t=' + type + "&_t=" + (new Date().getTime());

			//See if they need to provide a referer.
			if ($.fn.peerbind.defaults.referer) {
				url += "&u=" + $.fn.peerbind.defaults.referer;
			}

			if (type == "geo" && navigator && navigator.geolocation) {
				navigator.geolocation.watchPosition((function (url) {
					return (function (location) {
						if ($.fn.peerbind.defaults.coords.lat != location.coords.latitude || $.fn.peerbind.defaults.coords.long != location.coords.longitude) {
							$.fn.peerbind.defaults.coords.lat = location.coords.latitude;
							$.fn.peerbind.defaults.coords.long = location.coords.longitude;
							var data = encodeURIComponent(location.coords.latitude + "," + location.coords.longitude);
							$.fn.peerbind.defaults.regstring = data;
							$.fn.peerbind.ajax({
								url: url + "&d=" + data,
								dataType: "script"
							});
						}
					});
				})(url), function () {
					//No location:
					$.fn.peerbind.defaults.regstring = "0,0";
					$.fn.peerbind.ajax({
						url: url + "&d=0,0",
						dataType: "script"
					});
				});
			} else {
				$.fn.peerbind.ajax({
					url: url + "&d=" + $.fn.peerbind.defaults.regstring,
					dataType: "script"
				});
			}

			setInterval($.fn.peerbind.eventWatcher, 1000);
		}

		var myPingTime = (new Date()).getTime();
		var pingsAnswered = [];

		$(window).bind("storage", (function (myPingTime, pingsAnswered) {
			return (function (e) {
				var pingTime = localStorage["peerping"] - 0;

				//Ping occurred within 500 millis... and its not my ping.
				if (((new Date()).getTime() - pingTime) < 500 && pingTime != myPingTime && pingsAnswered[pingTime] == null) {
					pingsAnswered[pingTime] = 1;
					localStorage["peerpong"] = (localStorage.peerpong - 0) + 1 + $.fn.peerbind.state.pongcount;
				}

			});
		})(myPingTime, pingsAnswered));

		//Trigger the storage event.
		if (localStorage) {
			//Start the count.
			localStorage.removeItem("peerpong");
			localStorage["peerpong"] = 0;

			//Clear any ping that might be there, then cause an event.
			localStorage.removeItem("peerping");
			localStorage["peerping"] = myPingTime;

			//Check to see how many pongs we got.
			setTimeout(function () {
				if ((localStorage.peerpong - 0) != 0) {
					uuid = uuid + "-" + localStorage.peerpong;
					$.fn.peerbind.state.pongcount = (localStorage.peerpong - 0) + 1;
				}

				$.fn.peerbind.defaults.uuid = uuid;
				handleRegistration();
			}, 51);
		}
	}

	$.fn.peerbind.peerbindRegister = function (data) {
		$.fn.peerbind.state.registering = false;
		$.fn.peerbind.state.registered = true;

		if ($.fn.peerbind.defaults.regcallback) {
			$.fn.peerbind.defaults.regcallback($.fn.peerbind.defaults);
		}
	};

	$.fn.peerbind.peerbindPost = function (data) {};

	$.fn.peerbind.peerbindGetEndpoint = function () {
		var prefixes = $.fn.peerbind.defaults.endpointprefixes;
		if (prefixes && prefixes.length > 0) {
			//cycle through prefixes
			var curPrefix = prefixes[$.fn.peerbind.state.endpointct % prefixes.length];
			$.fn.peerbind.state.endpointct++;
			
			//Allow for localhost / IP's to be set for testing
			if (curPrefix.length > 0){
				curPrefix = curPrefix + ".";
			}
		
			return curPrefix + $.fn.peerbind.defaults.endpoint;
			
		} else return $.fn.peerbind.defaults.endpoint;
	}

	$.fn.peertrigger = function (type, data, peerTarget) {
		this.each(function () {
			//Make sure this type of event is bound.
			if (!$(this).data("peerbound" + type)) {
				$(this).peerbind(type, null);
			}

			var e = new jQuery.Event(type + ".pbind");
			e.data = data;
			e.peerData = data;
			e.peerTarget = peerTarget;
			e.srcPeer = null;

			$(this).trigger(e);
		});

		return this;
	};

	$.fn.peerunbind = function (type) {
		this.each(function () {
			$(this).unbind(type + ".pbind");
		});

		return this;
	};

	//Allow direct access to the registration.
	$.fn.peerregister = function ( /*settings,*/ callback) {
		//See if they want to change the defaults here.
		if (callback && !$.isFunction(callback) && $.isPlainObject(callback)) {
			//Yup set the
			$.extend(true, $.fn.peerbind.defaults, callback);

			callback = null;
			if (arguments[1]) {
				callback = arguments[1];
			}
		}

		if (callback) $.fn.peerbind.defaults.regcallback = callback;

		if (!$.fn.peerbind.state.registered) $.fn.peerbind.registerDevice();
		else if (callback) {
			callback();
		}
	}

	//This can be overriden for your own output method.
	$.fn.peererror = function (msg) {
		if (window["console"] && window.console["log"]) {
			window.console.log("Peerbind error: " + msg);
		}
	}

	$.fn.peerbind.registerwithname = function (name, callback) {
		if (!name) {
		//Get the name.
		} else {
			$.fn.peerbind.state.namedregistering = false;
			$.fn.peerbind.state.namedserverdone = false;
			$.fn.peerbind.defaults.namedServerName = name;
			$.fn.peerbind.defaults.namedServerCallback = callback;
			//Register Request: http://www.peerbind.com/register/?f=f&g=uniqueId&t=page           
			//Referer: http://peerbind.com/iphoneserver/0.1/
			var findServerURL = "http://www.peerbind.com/register/?f=$.fn.peerbind.namedRegDone&g=" + $.fn.peerbind.establishUUID() + "&t=page&u=" + encodeURIComponent("http://peerbind.com/iphoneserver/0.1/" + name) + "&_t=" + (new Date()).getTime();
			$.fn.peerbind.ajax({
				url: findServerURL,
				dataType: "script"
			});
		}
	}

	$.fn.peerbind.namedRegDone = function () {
		if (!$.fn.peerbind.state.namedserverdone) {
			var postServerURL = "http://www.peerbind.com/post/?f=$.fn.peerbind.pollForServerResponse&g=" + $.fn.peerbind.defaults.uuid + "&t=page&e=['sendmesomethingplease']&u=" + encodeURIComponent("http://peerbind.com/iphoneserver/0.1/" + $.fn.peerbind.defaults.namedServerName) + "&_t=" + (new Date()).getTime();

			//See if they need to provide a referer.
			if ($.fn.peerbind.defaults.referer) {
				postServerURL += "&u=" + $.fn.peerbind.defaults.referer;
			}

			$.fn.peerbind.ajax({
				url: postServerURL,
				dataType: "script"
			});

			setTimeout($.fn.peerbind.namedRegDone, 3000);
		}
	}

	$.fn.peerbind.pollForServerResponse = function () {
		if (!$.fn.peerbind.state.namedserverdone) {
			var pollServerURL = "http://www.peerbind.com/poll/?f=$.fn.peerbind.namedServerResponse&g=" + $.fn.peerbind.defaults.uuid + "&t=page&u=" + encodeURIComponent("http://peerbind.com/iphoneserver/0.1/" + $.fn.peerbind.defaults.namedServerName) + "&_t=" + (new Date()).getTime();

			//See if they need to provide a referer.
			if ($.fn.peerbind.defaults.referer) {
				pollServerURL += "&u=" + $.fn.peerbind.defaults.referer;
			}

			$.fn.peerbind.ajax({
				url: pollServerURL,
				dataType: "script"
			});

			setTimeout($.fn.peerbind.pollForServerResponse, 3000);
		}

	}

	$.fn.peerbind.namedServerResponse = function (data) {
		if (data && data.length) {
			for (var i = 0; i < data.length; i++) {
				if (data[i] && data[i].server && !$.fn.peerbind.state.namedregistering) {
					$.fn.peerbind.defaults.endpointprefixes = [];
					$.fn.peerbind.defaults.endpoint = data[i].server + ":" + data[i].port;
					$.fn.peerbind.state.namedserverdone = true;
					$.fn.peerbind.state.registered = false;
					$.fn.peerbind.state.registering = false;
					$.fn.peerbind.state.namedregistering = true;
					$.fn.peerregister($.fn.peerbind.defaults.namedServerCallback);
					break;
				}
			}
		}
	}

	$.fn.peerbind.ajax = function (obj) {
		if ($.fn.peerbind.defaults.type != "disabled") {
			$.ajax(obj);
		}
	}



	$.fn.peerbind.types = ["domain", "page", "ip", "geo", "string", "disabled"];

	$.fn.peerbind.state = {
		'registered': false,
		'pollstart': null,
		'polltimeout': null,
		'postcalls': 0,
		'endpointct': 0,
		'callswaiting': [],
		'callintervals': [],
		'triggeredevents': [],
		'pongcount': 0,
		'namedserverdone': false
	};

	$.fn.peerbind.defaults = {
		'endpointprefixes': ["www", "www1", "www2", "www3", "www4", "www5", "www6", "www7", "www8", "www9", "www10"],
		'endpoint': "peerbind.com",
		'referer': document.location.href + "",
		'uuid': null,
		'type': $.fn.peerbind.types[1],
		'regstring': '',
		'coords': {
			lat: 0,
			long: 0
		},
		'coordsSet': false, /* Unused.. */
		'pollinterval': 500,
		'pollmax': 31000,
		'regcallback': null
	};

	$.fn.peerbind.blacklist = {};
})(jQuery);