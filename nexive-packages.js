var moment = require('moment');
var casper = require('casper').create();
var fs = require('fs');

var credentials = require('credentials.json');

var startingUrl = 'https://www.sistemacompleto.it/Senders/Ricerche/TrackAndTrace.aspx';

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
    return parseInt($('.dxpCurrentPageNumber').html().slice(1, -1), 10);
  });
}

// Step 3 (recursive)
var checkCurrentPage = function() {
  return fetchCurrentPageIndex.bind(this)() == stepCurrentPageIndex;
}

var parseCurrentPage = function(nextCallback) {
  this.echo('Current page index: ' + fetchCurrentPageIndex.bind(this)());
  var pageShipmentStatuses = this.evaluate(function() {
    return $('.dxgvTable .dxgvDataRow').map(function(index, element) {
      var indexMapping = {
        barcode: 1, // BarCode
        firstName: 2, // Nome
        lastName: 3, // Cognome
        city: 4, // Comune
        province: 5, // Prov
        lastUpdatedAt: 6, // Data Ultimo Stato
        state: 7, // Stato
        reason: 8, // Motivo
        cod: 9, // COD
        units: 11, // Colli
        estimatedDeliveryDate: 12, // Data Prevista Consegna
        fileId: 13, // Id File
        createdAt: 14, // Data Creazione
        customerReference: 15, // Rif. Cliente
        priceFacility: 16 // Centro di Costo
      };
      var data = {};
      for (var key in indexMapping) {
        data[key] = $(element).children().eq(indexMapping[key]).html();
        if (data[key] == '&nbsp;') {
          data[key] = '';
        }
      }

      // size: 10, // Taglia
      data.size = $(element).children().eq(10).children('span').html();

      data.detailsLinkId = $(element).children().eq(0).find('img').attr('id');

      return data;
    }).get();
  });

  var fetchDetailInfoAndAdvanceUnlessLastRow = function(pageShipmentStatusIndex) {
    if (pageShipmentStatusIndex >= pageShipmentStatuses.length) {
      shipmentStatuses = shipmentStatuses.concat(pageShipmentStatuses);
      nextCallback();
      return;
    }
    var detailsLinkId = pageShipmentStatuses[pageShipmentStatusIndex].detailsLinkId;
    this.echo('Loading detail ' + (pageShipmentStatusIndex + 1) + '/' + pageShipmentStatuses.length);
    this.click('#' + detailsLinkId);
    this.waitFor(
      function() {
        return this.evaluate(function() {
          return $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_LblDestIndirizzo').length == 1;
        });
      }.bind(this), function() {
        var detailsData = this.evaluate(function() {
          var address = $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_LblDestIndirizzo').html().trim();
          var cap = $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_LblDestCap').html().trim();
          return {
            address: address,
            cap: cap
          };
        });
        pageShipmentStatuses[pageShipmentStatusIndex].address = detailsData.address;
        pageShipmentStatuses[pageShipmentStatusIndex].cap = detailsData.cap;
        delete pageShipmentStatuses[pageShipmentStatusIndex].detailsLinkId;
        fetchDetailInfoAndAdvanceUnlessLastRow(pageShipmentStatusIndex + 1);
      }.bind(this), function() {
        this.echo('Timed out.');
      }.bind(this),
      10000
    );
  }.bind(this);
  fetchDetailInfoAndAdvanceUnlessLastRow(0);
}

var isLastPage = function() {
  return this.evaluate(function() {
    return $('.dxWeb_pNextDisabled').length == 1;
  });
}

var advanceToNextPage = function() {
  this.evaluate(function() {
    var nextPaginationLink = $('.dxpCurrentPageNumber').nextAll('.dxpPageNumber').eq(0);
    nextPaginationLink.click();
  });
  ++stepCurrentPageIndex;
  this.waitFor(
    checkCurrentPage.bind(this),
    parseCurrentPageAndAdvanceUnlessLastPage.bind(this)
  );
}

var parseCurrentPageAndAdvanceUnlessLastPage = function() {
  parseCurrentPage.bind(this)(function() {
    if (!isLastPage.bind(this)()) {
      advanceToNextPage.bind(this)();
    }
  }.bind(this));
}

// Execution flow
casper.start(startingUrl, loginStep.bind(casper));

casper.waitFor(
  checkAdvancedSearchButton.bind(casper),
  clickAdvancedSearchButton.bind(casper)
);

casper.waitFor(
  checkCurrentPage.bind(casper),
  parseCurrentPageAndAdvanceUnlessLastPage.bind(casper)
);

// debugging only
var printResults = function() {
  var barcodes = shipmentStatuses.map(function(shipmentStatus) {
    return shipmentStatus.barcode;
  }).join(', ');
  this.echo('Extracted ' + shipmentStatuses.length + ' records: [' + barcodes + ']');
}

var dumpResultsToFile = function() {
  var outputFilename = moment().format('[nexive-packages-]YYYYMMDDhhmmss[.json]');
  fs.write(outputFilename, JSON.stringify(shipmentStatuses), 'w');
  this.echo('Results stored in: ' + outputFilename);
}

// Ending code
casper.run(function() {
  dumpResultsToFile.bind(this)();
  this.exit();
});
