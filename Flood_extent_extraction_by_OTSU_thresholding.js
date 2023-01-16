//This current polygon is drawn such that it encompasses land and water in 50-50
//so as to comply with otsu threshold technique of finding threshold by making istogram
//for land and water where both are found in equal proportionate.

var polygon = ee.FeatureCollection(poly);
Map.centerObject(polygon);
Map.addLayer(polygon);
var image_sentinel = ee.ImageCollection('COPERNICUS/S1_GRD');
var vizParams = {bands: ['VV', 'HH', 'HV'], min: -18, max: 0};

var image = ee.Image(
  image_sentinel.filterBounds(polygon)
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
.select('VH')
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
  .filterDate("2020-06-10","2020-06-18")
  .median()
  .clip(polygon)
  );
var image2 = image;
var image3 = image2.focal_median(16,'circle','meters');
Map.addLayer((image3),{bands: 'VH',min: -18, max: 0}, 'sentinel');

var histogram = image3.select('VH').reduceRegion({
  reducer: ee.Reducer.histogram(255, 2)
      .combine('mean', null, true)
      .combine('variance', null, true), 
  geometry: polygon, 
  scale: 10,
  bestEffort: true
});

var otsu = function(histogram) {
  var counts = ee.Array(ee.Dictionary(histogram).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogram).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  
  var indices = ee.List.sequence(1, size);
  
  var bss = indices.map(function(i) {
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    return aCount.multiply(aMean.subtract(mean).pow(2)).add(
           bCount.multiply(bMean.subtract(mean).pow(2)));
  });
   return means.sort(bss).get([-1]);
};

var threshold = otsu(histogram.get('VH_histogram'));
print('threshold', threshold);

var class1 = image3.select('VH').lt(threshold);

Map.addLayer(class1.mask(class1), {palette: 'blue'}, 'class A');

Export.image.toDrive({
  image : class1,
  description : 'flood',
  scale : 10,
  region : polygon,
  })