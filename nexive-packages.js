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

var debug = function(data) {
  console.debug(data);
};

var pageShipmentStatuses = [];
var pageShipmentStatusIndex = 0;
var nextCallback = function() {};
var nextDetailInfoCallback = function() {};
var pageDetailInfoIndex = 1;

var fetchCreatedAtFromDetailInfo = function() {
  var createdAt = this.evaluate(function() {
    var rows = $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_ElencoMovimenti_DXMainTable .dxgvDataRow');
    var row = rows.filter(function(index, row) {
      var status = $(row).find('.dxgv').eq(2).html().trim();
      return status == 'In Lavorazione - Presa in Carico';
    });
    if (row.length == 1) {
      return row.find('.dxgv').eq(0).html().trim();
    } else {
      return null;
    }
  });
  if (createdAt == '') {
    return null;
  } else {
    return createdAt;
  }
};

var pageDetailHasNextPage = function() {
  return this.evaluate(function() {
    return $('#iDettaglio').contents().find('.dxWeb_pNext').length > 0;
  });
};

var clickDetailInfoNextButton = function() {
  this.evaluate(function() {
    $('#iDettaglio').contents().find('.dxWeb_pNext').click();
  });
};

var hasLoadedPageDetailPage = function() {
  return this.evaluate(function(pageDetailInfoIndex) {
    return $('#iDettaglio').contents().find('.dxpCurrentPageNumber').html().slice(1, -1) == pageDetailInfoIndex;
  }, pageDetailInfoIndex);
};

var handleTimeout = function() {
  this.echo('Timed out.');
};

var fetchCreatedAtInfoAndAdvance = function() {
  var createdAt = fetchCreatedAtFromDetailInfo.bind(this)();
  if (createdAt) {
    pageShipmentStatuses[pageShipmentStatusIndex].createdAt = createdAt;
    nextDetailInfoCallback();
  } else if (pageDetailHasNextPage.bind(this)()) {
    ++pageDetailInfoIndex;
    clickDetailInfoNextButton.bind(this)();
    this.waitFor(
      hasLoadedPageDetailPage.bind(this),
      fetchCreatedAtInfoAndAdvance.bind(this),
      handleTimeout.bind(this),
      10000
    );
  } else {
    nextDetailInfoCallback();
  }
};

var fetchDetailInfo = function() {
  var detailsData = this.evaluate(function() {
    var address = $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_LblDestIndirizzo').html().trim();
    var cap = $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_LblDestCap').html().trim();
    var createdAt = '';
    var data = {
      createdAt: createdAt,
      address: address,
      cap: cap
    };
    return data;
  });

  pageShipmentStatuses[pageShipmentStatusIndex].address = detailsData.address;
  pageShipmentStatuses[pageShipmentStatusIndex].cap = detailsData.cap;

  if (detailsData.createdAt != '') {
    pageShipmentStatuses[pageShipmentStatusIndex].createdAt = detailsData.createdAt;
  }

  delete pageShipmentStatuses[pageShipmentStatusIndex].detailsLinkId;

  nextDetailInfoCallback = function() {
    ++pageShipmentStatusIndex;
    fetchDetailInfoAndAdvanceUnlessLastRow.bind(this)();
  }.bind(this);

  pageDetailInfoIndex = 1;
  fetchCreatedAtInfoAndAdvance.bind(this)();
}

var hasLoadedDetailIFrame = function() {
  return this.evaluate(function() {
    return $('#iDettaglio').contents().find('#ctl00_ContentPlaceHolder1_LblDestIndirizzo').length == 1;
  });
};

var fetchDetailInfoAndAdvanceUnlessLastRow = function() {
  if (pageShipmentStatusIndex >= pageShipmentStatuses.length) {
    shipmentStatuses = shipmentStatuses.concat(pageShipmentStatuses);
    nextCallback();
    return;
  }
  var detailsLinkId = pageShipmentStatuses[pageShipmentStatusIndex].detailsLinkId;

  this.echo('Loading detail ' + (pageShipmentStatusIndex + 1) + '/' + pageShipmentStatuses.length);
  this.click('#' + detailsLinkId);

  this.waitFor(
    hasLoadedDetailIFrame.bind(this),
    fetchDetailInfo.bind(this),
    handleTimeout.bind(this),
    10000
  );
}

var inlineFetchOfPageShipmentStatuses = function() {
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

    data.createdAt = '';

    // size: 10, // Taglia
    data.size = $(element).children().eq(10).children('span').html();

    data.detailsLinkId = $(element).children().eq(0).find('img').attr('id');

    return data;
  }).get();
};

var parseCurrentPage = function() {
  this.echo('Current page index: ' + fetchCurrentPageIndex.bind(this)());
  pageShipmentStatuses = this.evaluate(inlineFetchOfPageShipmentStatuses);

  pageShipmentStatusIndex = 0;
  fetchDetailInfoAndAdvanceUnlessLastRow.bind(this)();
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
  nextCallback = function() {
    if (!isLastPage.bind(this)()) {
      advanceToNextPage.bind(this)();
    }
  }.bind(this);
  parseCurrentPage.bind(this)();
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
  var outputFilename = moment().format('[nexive-packages-]YYYYMMDDHHmmss[.json]');
  fs.write(outputFilename, JSON.stringify(shipmentStatuses), 'w');
  this.echo('Results stored in: ' + outputFilename);
}

// Ending code
casper.run(function() {
  dumpResultsToFile.bind(this)();
  this.exit();
});
