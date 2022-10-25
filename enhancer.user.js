// ==UserScript==
// @name         Haven Food Vatsul Enhancements
// @namespace    http://tampermonkey.net/
// @version      1.01
// @description  Food table enhancements
// @author       Cmoon
// @match        https://hnhfood.vatsul.com/
// @match        https://food.hearthlands.net/
// @require      https://code.jquery.com/jquery-3.6.1.min.js
// @resource     STYLUS_CSS https://github.com/cmoondev/vatsul-haven-food-enhancements/raw/main/enhancer.css
// @icon         https://www.google.com/s2/favicons?domain=vatsul.com
// @downloadURL  https://github.com/cmoondev/vatsul-haven-food-enhancements/raw/main/enhancer.user.js
// @updateURL    https://github.com/cmoondev/vatsul-haven-food-enhancements/raw/main/enhancer.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==


var TABLE_CONTAINER_OBS;
var TABLE_OBS

var DEBUG = false;


function debugLog(msg) {
    if (!DEBUG) {
        return;
    }

    console.log('[DEBUG]: ' + msg);
}


// Helper function to find out when a DOM changes.
var observeDOM = (function () {
    var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

    return function (obj, callback) {
        if (!obj || obj.nodeType !== 1) return;

        if (MutationObserver) {
            var mutationObserver = new MutationObserver(callback);

            // have the observer observe foo for changes in children
            mutationObserver.observe(obj, { childList: true, subtree: true });
            return mutationObserver;
        }

        // browser support fallback
        else if (window.addEventListener) {
            obj.addEventListener('DOMNodeInserted', callback, false);
            obj.addEventListener('DOMNodeRemoved', callback, false);
        }
    }
})();


// Helper function that polls a DOM to see if it exists yet. Not an ideal solution but it works for now.
function waitForElementToDisplay(selector, delay, logMsg, argFunction) {
    if (document.querySelector(selector) == null) {
        setTimeout(() => {
            waitForElementToDisplay(selector, delay, logMsg, argFunction);
        }, 100)
    } else {
        debugLog(logMsg);

        if (argFunction && (typeof argFunction == "function")) {
            argFunction();
        } else {
            console.log("[ERROR]: Passed function arg was not a function.");
        }

        return document.querySelector(selector);
    }
}


// Helper function to mimic a user updating the search field to fire the table events that update the results.
function fireChangeEvents(element) {
    var changeEvent = null;
    changeEvent = document.createEvent("HTMLEvents");
    changeEvent.initEvent("input", true, true);
    element.dispatchEvent(changeEvent);
    //console.log('input event dispatched for element: '+ element.id);

    changeEvent = document.createEvent("HTMLEvents");
    changeEvent.initEvent("keyup", true, true);
    element.dispatchEvent(changeEvent);
    //console.log('keyup event dispatched for element: '+ element.id);

    changeEvent = document.createEvent("HTMLEvents");
    changeEvent.initEvent("change", true, true);
    element.dispatchEvent(changeEvent);
    //console.log('change event dispatched for element: '+ element.id);
}


// Deprecated
function createPercentButton() {
    var button = document.createElement('button');
    button.style.setProperty('color', 'black', 'important');
    button.style.height = '50%';
    button.style.marginTop = '5px';
    button.textContent = "Show Percentages";
    button.id = 'showPerc';
    button.addEventListener('click', function () { onTableChanged(); });

    waitForElementToDisplay('.mat-paginator-container', 100, "Appending percentages button to container.", function () {
        document.querySelector('.mat-paginator-container').appendChild(button);
    });
}


function addFepPercentages() {
    var fepBarArr = document.querySelectorAll('.fep-bar-elem.ng-star-inserted');
    fepBarArr.forEach(e => {
        // make stat2 white and stat1 colors black.
        if (e.getAttribute('fep').length > 3) {
            e.classList.add('stat2');
        } else {
            e.classList.add('stat1');
        }
        e.textContent = Math.round(e.style.width.substr(0, e.style.width.length - 1)) + "%";
    });
    //console.log("[INFO]: Adding percentages to fep bar.");
}


function formatIngredients() {
    debugLog('Formatting ingredients on new lines.');

    const INGREDIENT_INDEX = 11;

    var tbody = document.querySelector('body > app-root > app-foodtable > div.foodtable > table > tbody');
    var tableRows = tbody.childNodes;

    // Disconnect the mutation observers before we start changing the table or it will just loop the onTableChanged() function call.
    if (TABLE_CONTAINER_OBS != undefined && TABLE_CONTAINER_OBS != null) {
        TABLE_CONTAINER_OBS.disconnect();
    }

    if (TABLE_OBS != undefined && TABLE_OBS != null) {
        TABLE_OBS.disconnect();
    }

    // each ingredient row in the table
    tableRows.forEach(function (node) {
        //debugLog("foreach: " + node.rowIndex);

        var ingredientChildNode = node.childNodes[INGREDIENT_INDEX];
        // Check for null because some things like roasted meats don't have any ingredients.
        if (ingredientChildNode == undefined || ingredientChildNode == null) {
            debugLog('Skipping entry with null ingredients');
            return;
        }

        var currentHtml = node.childNodes[INGREDIENT_INDEX].innerHTML;

        // Color all the percentages
        // TODO: account for 200% items like Crêpe Noisette
        currentHtml = currentHtml.replaceAll(/(\d\d\d%)(\s|$)/g, '<span class="percentfull">$1</span>\n'); // replace all 100% first
        currentHtml = currentHtml.replaceAll(/(\d+%)(\s|$)/g, '<span class="percentmixed">$1</span>\n'); // then replace <100%

        // Color spices
        var spices = ['Black Pepper', 'Chives', 'Dill', 'Juniper Berries', 'Kvann', 'Laurel Leaves', 'Sage', 'Thyme']
        for (let i = 0; i < spices.length; i++) {
            currentHtml = currentHtml.replaceAll(spices[i], '<span class="' + spices[i].replace(' ', '-').toLowerCase() + '">' + spices[i] + '</span>');
        }

        node.childNodes[INGREDIENT_INDEX].innerHTML = '<pre>' + currentHtml + '</pre>'; // add pre tags last so it doesn't mess with regex $
    });

    addTableDivObs();
    debugLog('End formatIngredients().');
}


// Helper function to add the required prefixes to a list of strings names.
function buildExclusionString(prefix, ingredientsList) {
    var exclusions = '';
    ingredientsList.forEach(function (ingredient) {
        exclusions += prefix + ingredient + ';';
    });

    return exclusions;
}


// Adds a list of exclusions to the search bar. Unfortunately doesn't trigger until after an input is typed by the user. ex: ; at the end
function addSearchExclusions() {
    var inputFilter = waitForElementToDisplay('#searchinput', 100, "Adding exclusions.", function () {
        var searchInput = document.querySelector('#searchinput');
        var finalSearchQuery = '';

        // ingredients
        var rareMeats = ['cachalot', 'orca', '"troll"', 'bollock'];
        var lateSpices = ['dill', 'thyme'];
        var resourceSpices = ['fairy', 'driftkelp', 'heartwood']

        // food names
        var foods = ['creamy', 'cave slime'];

        finalSearchQuery = buildExclusionString('-from:', rareMeats.concat(lateSpices, resourceSpices)) + buildExclusionString('-name:', foods);
        searchInput.value = finalSearchQuery;

        // Can't trigger the change event for input field here since the angular isn't loaded at this point.
        // Set it after the table's body is loaded. See addTbodyObs() function;
    });
}


// Div that holds the table. when the search results = 0 the table element is removed so it removes the observer as well...
// We can watch the table's container <div> to readd the observer when the tbody exists (actually has results).
function addTableDivObs() {
    debugLog("addTableDivObs()");

    waitForElementToDisplay('body > app-root > app-foodtable > div.foodtable', 100, "Adding observer to food table container <div>.", function () {
        var divTable = document.querySelector('body > app-root > app-foodtable > div.foodtable');
        TABLE_CONTAINER_OBS = observeDOM(divTable, function () {
            var tbody = document.querySelector('body > app-root > app-foodtable > div.foodtable > table > tbody');
            if (tbody != undefined && tbody != null) {
                //console.log("[DEBUG] tbody was undefined or null.");
                addTbodyObs();
            }

        });

        debugLog("Table div obs changed.");
    });
}


// Function that the tbody observer can call for all other functions that need to happen at this event.
function onTableChanged() {
    addFepPercentages();
    formatIngredients();
}


function addTbodyObs() {
    waitForElementToDisplay('body > app-root > app-foodtable > div.foodtable > table > tbody', 100, "Adding observer to food table tbody.", function () {
        // Call this once after the observer gets added because it doesn't fire at that time (else won't run when page is loaded the first time).
        onTableChanged();
        fireChangeEvents(document.querySelector('#searchinput'));

        var tbody = document.querySelector('body > app-root > app-foodtable > div.foodtable > table > tbody');
        TABLE_OBS = observeDOM(tbody, onTableChanged);
    });
}


function addCss() {
    console.log("[INFO]: Importing stylus css from github");
    const STYLUS_CSS = GM_getResourceText("STYLUS_CSS");
    //debugLog(STYLUS_CSS);
    GM_addStyle(STYLUS_CSS);
}


(function () {
    'use strict';

    console.log("[INFO]: Haven Food Enhancements");

    addCss();

    // Not really needed anymore since we can use mutation obs to auto add them to table.
    //createPercentButton();

    addSearchExclusions();
    addTableDivObs();

})();