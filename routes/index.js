var express = require('express');
var router = express.Router();
var csrf = require('csurf');
var passport = require('passport');

var csrfProtection = csrf();
router.use(csrfProtection);

var Catalog = require('../models/catalog');
var Product = require('../models/product');

/* GET home page. */
router.get('/', function(req, res, next) {
  var successMsg = req.flash('success')[0];

  Product.find().limit(25).exec(function(err, list) {
    var chunks = [];
    var chunkSize = 3;

    for (var i = 0; i < list.length; i+=chunkSize) {
      chunks.push(list.slice(i, i + chunkSize));
    } 

    Catalog.find().populate({
      path: 'childs',
      populate: {
        path: 'childs',
        populate: {
          path: 'childs'
        }
      }
    }).exec(function (err, catalogs) {
      var roots = catalogs.filter(function(catalog) {
        return catalog.parentId === null;
      });

      res.render('index', {
        catalog_active: {name: "Каталог", code: null, childs: []},
        withProducts: true,
        product_chunks: chunks, 
        noMessage: !successMsg, 
        successMsg: successMsg, 
        roots: roots
      });
    });
  }); 
});

router.get(/^\/catalog\/.*?$/, function(req, res, next) {
  var successMsg = req.flash('success')[0];
  var locals = {
    noMessage: !successMsg, 
    successMsg: successMsg
  };

  locals.selected_filter = ('filter' in req.query) ? req.query.filter : [];

  // ищем раздел каталога
  Catalog.findOne({full_path: req._parsedUrl.pathname}).
  populate('childs').
  populate({
    path: 'filter.property',
    model: 'Property'
  }).populate({
    path: 'filter.value',
    model: 'PropertyValue'
  }).  
  exec()
  
  // подбираем товары для данного раздела  
  .then(function(catalog) {
    if (catalog) {
      // передаем информацию о текущем разделе каталога
      locals.catalog_active = catalog;      
      locals.filters = catalog.filter.reduce(function ( total, current ) {
        if (typeof total[ current.property._id ] === 'undefined')
            total[ current.property._id ] = [];

        total[ current.property._id ].push(current);

        return total;
      }, {});

      var products_query = {catalog: {$in: [catalog._id]}};
      if (catalog.childs) {
        function merge_childs(childs, ids) {
          childs.forEach(function(child) {
            if (typeof child._id === 'undefined')
              ids.push(child);
            else
              ids.push(child._id);

            if (child.childs)
              ids = merge_childs(child.childs, ids);
          });

          return ids;
        }

        products_query.catalog.$in = merge_childs(catalog.childs, products_query.catalog.$in);
      }

      var property_filter = [];
      Object.keys(locals.selected_filter).forEach(function(property) {
        locals.selected_filter[property].forEach(function(value) {
          property_filter.push({'properties.values.index' : property + '#' + value});
        });
      });
      if (property_filter.length) {
        products_query.$and = property_filter;
      }

      return Product.find(products_query).limit(25).exec();
    } else {
      throw new Error('Раздел каталога не существует');
    }
  })

  // организуем вывод товаров по три в ряд
  .then(function(list) {
    var chunks = [];
    var chunkSize = 3;

    if (list) {
      for (var i = 0; i < list.length; i+=chunkSize) {
        chunks.push(list.slice(i, i + chunkSize));
      }
    }

    locals.product_chunks = chunks;
    locals.withProducts = list.length;
  })

  // формируем навигацию по каталогу
  .then(function() {
    return Catalog.find().populate({
      path: 'childs',
      populate: {
        path: 'childs',
        populate: {
          path: 'childs'
        }
      }
    }).exec();
  })

  // получаем корневые разделы
  .then(function (catalogs) {
    locals.roots = catalogs.filter(function(catalog) {
      return catalog.parentId === null;
    })
  })

  // отрисовываем шаблон
  .then(function() {
    return res.render('index', locals);
  })

  // обрабатываем ошибки
  .catch(function(err){
    console.log('error:', err);
  });  
});

module.exports = router;
