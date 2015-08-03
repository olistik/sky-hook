var moment = require('moment');
var casper = require('casper').create();
var fs = require('fs');

var credentials = require('credentials.json');

var startingUrl = 'https://www.sistemacompleto.it/Senders/Ricerche/TrackAndTrace.aspx';
var startingPageIndex = 1;
var enoughPagesCounter = 150; // pages 1-150
var longTimeout = 60000; // 1 minute

if (casper.cli.has('startingPageIndex')) {
  startingPageIndex = casper.cli.get('startingPageIndex');
};

if (casper.cli.has('enoughPagesCounter')) {
  enoughPagesCounter = casper.cli.get('enoughPagesCounter');
};

if (casper.cli.has('username')) {
  credentials.username = casper.cli.get('username');
};

if (casper.cli.has('password')) {
  credentials.password = casper.cli.get('password');
};

casper.echo('Fetching data for user: ' + credentials.username);

var pageRange = '[P' + startingPageIndex + '-' + (startingPageIndex + enoughPagesCounter) + '] ';

casper.echo(pageRange);

// Step 1
var loginStep = function() {
  this.fillSelectors('form[name="aspnetForm"]', {
    'input[name="ctl00$contentPlaceHolder$usernameIn"]': credentials.username,
    'input[name="ctl00$contentPlaceHolder$passwordIn"]': credentials.password
  }, false);

  this.click('#ctl00_contentPlaceHolder_label_btnAccedi');
};

// Step 2
var checkAdvancedSearchButton = function() {
  return this.evaluate(function() {
    return $('#ctl00_cphMainContext_hlkTrackAndTrace').length == 1;
  });
}

var clickAdvancedSearchButton = function() {
  this.click('#ctl00_cphMainContext_hlkTrackAndTrace');
}

// global vars
var stepCurrentPageIndex = 1;
var shipmentStatuses = [];

var fetchCurrentPageIndex = function() {
  return this.evaluate(function() {
    return parseInt($('.dxp-num.dxp-current').html(), 10);
  });
}

// Step 3 (recursive)
var checkCurrentPage = function() {
  return fetchCurrentPageIndex.bind(this)() == stepCurrentPageIndex;
}

var debug = function(data) {
  console.debug(data);
};

var pageShipmentStatuses = [];
var pageShipmentStatusIndex = 0;
var nextCallback = function() {};
var pageDetailInfoIndex = 1;

var hasLoadedPageDetailPage = function() {
  return this.evaluate(function(pageDetailInfoIndex) {
    return $('#mpPopupFrame').contents().find('.dxp-num.dxp-current').html().slice(1, -1) == pageDetailInfoIndex;
  }, pageDetailInfoIndex);
};

var handleTimeout = function() {
  this.echo(pageRange + 'Timed out.');
};

var fetchDetailInfo = function() {
  var detailsData = this.evaluate(function() {
    var address = $('#mpPopupFrame').contents().find('#ctl00_ContentPlaceHolder1_LblDestIndirizzo').html().trim();
    var cap = $('#mpPopupFrame').contents().find('#ctl00_ContentPlaceHolder1_LblDestCap').html().trim();
    var data = {
      address: address,
      cap: cap
    };
    return data;
  });

  pageShipmentStatuses[pageShipmentStatusIndex].address = detailsData.address;
  pageShipmentStatuses[pageShipmentStatusIndex].cap = detailsData.cap;

  delete pageShipmentStatuses[pageShipmentStatusIndex].detailsJavascript;

  ++pageShipmentStatusIndex;
  fetchDetailInfoAndAdvanceUnlessLastRow.bind(this)();
}

var hasLoadedDetailIFrame = function() {
  return this.evaluate(function() {
    return $('#mpPopupFrame').contents().find('#ctl00_ContentPlaceHolder1_LblDestIndirizzo').length == 1;
  });
};

var fetchDetailInfoAndAdvanceUnlessLastRow = function() {
  if (pageShipmentStatusIndex >= pageShipmentStatuses.length) {
    shipmentStatuses = shipmentStatuses.concat(pageShipmentStatuses);
    nextCallback();
    return;
  }
  var detailsJavascript = pageShipmentStatuses[pageShipmentStatusIndex].detailsJavascript;

  this.echo(pageRange + 'Loading detail ' + (pageShipmentStatusIndex + 1) + '/' + pageShipmentStatuses.length);
  this.evaluate(function(detailsJavascript) {
    eval(detailsJavascript);
  }, detailsJavascript);

  this.waitFor(
    hasLoadedDetailIFrame.bind(this),
    fetchDetailInfo.bind(this),
    handleTimeout.bind(this),
    longTimeout
  );
}

var inlineFetchOfPageShipmentStatuses = function() {
  return $('.dxgvTable_Nexive .dxgvDataRow_Nexive').map(function(index, element) {
    var indexMapping = {
      barcode: 1, // BarCode
      firstName: 3, // Nome
      lastName: 4, // Cognome
      city: 5, // Comune
      province: 6, // Prov
      lastUpdatedAt: 7, // Data Ultimo Stato
      state: 8, // Stato
      reason: 9, // Motivo
      cod: 10, // COD
      units: 15, // Colli
      estimatedDeliveryDate: 16, // Data Prevista Consegna
      fileId: 2, // Id File
      createdAt: 17, // Data Creazione
      customerReference: 18, // Rif. Cliente
      priceFacility: 19 // Centro di Costo
    };
    var data = {};
    for (var key in indexMapping) {
      data[key] = $(element).children().eq(indexMapping[key]).html();
      if (data[key] == '&nbsp;') {
        data[key] = '';
      }
    }

    // size: 10, // Taglia
    data.size = $(element).children().eq(13).children('span').html();

    data.detailsJavascript = $(element).children().eq(0).find('.InfoIcon').attr('onclick');

    return data;
  }).get();
};

var parseCurrentPage = function() {
  this.echo(pageRange + 'Current page index: ' + fetchCurrentPageIndex.bind(this)());
  pageShipmentStatuses = this.evaluate(inlineFetchOfPageShipmentStatuses);

  pageShipmentStatusIndex = 0;
  fetchDetailInfoAndAdvanceUnlessLastRow.bind(this)();
}

var isLastPage = function() {
  return this.evaluate(function() {
    return $('.dxWeb_pNextDisabled_Nexive').length == 1;
  });
}

var enoughPages = function() {
  return fetchCurrentPageIndex.bind(this)() == startingPageIndex + enoughPagesCounter;
}

var advanceToNextPage = function() {
  this.evaluate(function() {
    var nextPaginationLink = $('.dxp-num.dxp-current').nextAll('.dxp-num').eq(0);
    nextPaginationLink.click();
  });
  ++stepCurrentPageIndex;
  this.waitFor(
    checkCurrentPage.bind(this),
    parseCurrentPageAndAdvanceUnlessLastPage.bind(this),
    handleTimeout.bind(this),
    longTimeout
  );
}

var parseCurrentPageAndAdvanceUnlessLastPage = function() {
  nextCallback = function() {
    if (!isLastPage.bind(this)() && !enoughPages.bind(this)()) {
      advanceToNextPage.bind(this)();
    }
  }.bind(this);

  if (fetchCurrentPageIndex.bind(this)() < startingPageIndex) {
    this.echo(pageRange + 'Skipping page index: ' + fetchCurrentPageIndex.bind(this)());
    nextCallback();
  } else {
    parseCurrentPage.bind(this)();
  }
}

// Execution flow
casper.start(startingUrl, loginStep.bind(casper));

casper.waitFor(
  checkAdvancedSearchButton.bind(casper),
  clickAdvancedSearchButton.bind(casper),
  handleTimeout.bind(this),
  longTimeout
);

casper.waitFor(
  checkCurrentPage.bind(casper),
  parseCurrentPageAndAdvanceUnlessLastPage.bind(casper),
  handleTimeout.bind(this),
  longTimeout
);

// debugging only
var printResults = function() {
  var barcodes = shipmentStatuses.map(function(shipmentStatus) {
    return shipmentStatus.barcode;
  }).join(', ');
  this.echo(pageRange + 'Extracted ' + shipmentStatuses.length + ' records: [' + barcodes + ']');
}

var dumpResultsToFile = function() {
  var outputFilename = moment().format('[nexive-packages-]YYYYMMDDHHmmss[' + pageRange + '][.json]');
  fs.write(outputFilename, JSON.stringify(shipmentStatuses), 'w');
  this.echo(pageRange + 'Results stored in: ' + outputFilename);
}

// Ending code
casper.run(function() {
  dumpResultsToFile.bind(this)();
  this.exit();
});
