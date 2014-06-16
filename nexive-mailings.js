var moment = require('moment');
var casper = require('casper').create();
var fs = require('fs');

var credentials = require('credentials.json');

var startingUrl = 'https://www.formulacerta.it/Clienti/Default.aspx';

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

// Execution flow
casper.start(startingUrl, loginStep.bind(casper));

casper.waitFor(
  checkAdvancedSearchButton.bind(casper),
  clickAdvancedSearchButton.bind(casper)
);

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

var parseCurrentPage = function() {
  this.echo('Current page index: ' + fetchCurrentPageIndex.bind(this)());
  var pageShipmentStatuses = this.evaluate(function() {
    return $('.dxgvTable .dxgvDataRow').map(function(index, element) {
      var indexMapping = {
        receiver: 1, // Destinatario
        receiverAddress: 2, // Indirizzo Destinatario
        city: 3, // Città
        cap: 4, // Cap
        province: 5, // Provincia
        acceptedAt: 7, // Data Accettazione
        lastUpdatedAt: 9, // Data stato
        other1: 15, // Altro1
        other2: 16, // Altro2
      };
      var data = {};
      for (var key in indexMapping) {
        data[key] = $(element).children().eq(indexMapping[key]).html();
        if (data[key] == '&nbsp;') {
          data[key] = '';
        }
      }

      // barcode: 0, // BarCode
      data.barcode = $(element).children().eq(0).children().html();

      // state: 8, // Stato
      // "../../Images/statoBusta_X.jpg"
      var stateMapping = {
        '1': 'state_1', // Recapitata Nexive
        '2': 'state_2', // Postalizzata PT
        '3': 'state_3', // In lavorazione
        '4': 'state_4', // Rese
        '5': 'state_5', // NoCert
        '6': 'state_6', // In giacenza
        '7': 'state_7' // Nexive International
      };
      data.state = stateMapping[$(element).children().eq(8).find('img').attr('src').slice(24, -4)];

      return data;
    }).get();
  });
  shipmentStatuses = shipmentStatuses.concat(pageShipmentStatuses);
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
  parseCurrentPage.bind(this)();
  if (!isLastPage.bind(this)()) {
    advanceToNextPage.bind(this)();
  }
}

var performSearchAndAdvance = function() {
  this.click('#ctl00_cphMainContext_datePeriodoDa_B-1Img');
  this.waitUntilVisible('#ctl00_cphMainContext_datePeriodoDa_DDD_PW-1', function() {
    this.evaluate(function() {
      aspxCalShiftMonth('ctl00_cphMainContext_datePeriodoDa_DDD_C', -1);
      $(".dxeCalendarDay").removeClass('to-click');
      $('#ctl00_cphMainContext_datePeriodoDa_DDD_C_mc')
        .find(".dxeCalendarDay")
        .filter(function(index, element) {
          return $(element).html() == '1'
        })
        .first()
        .addClass('to-click');
    });
    this.click('#ctl00_cphMainContext_datePeriodoDa_DDD_C_mc .dxeCalendarDay.to-click');

    this.click('#ctl00_cphMainContext_datePeriodoA_B-1Img');
    this.waitUntilVisible('#ctl00_cphMainContext_datePeriodoA_DDD_PW-1', function() {
      this.click('#ctl00_cphMainContext_datePeriodoA_DDD_C_BT');

      this.click('#ctl00_cphMainContext_btnFiltra_B');

      this.waitForSelector(
        '#ctl00_cphMainContext_gdvDettaglio_DXMainTable .dxgvDataRow',
        parseCurrentPageAndAdvanceUnlessLastPage.bind(casper),
        function() {
          this.echo('Wait for the paginated results timed out.');
        },
        10000
      );
    });

  });
};

casper.then(performSearchAndAdvance.bind(casper));

var dumpResultsToFile = function() {
  var outputFilename = moment().format('[nexive-mailings-]YYYYMMDDhhmmss[.json]');
  fs.write(outputFilename, JSON.stringify(shipmentStatuses), 'w');
  this.echo('Results stored in: ' + outputFilename);
}

// Ending code
casper.run(function() {
  dumpResultsToFile.bind(this)();
  this.exit();
});
