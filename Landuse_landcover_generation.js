//THIS IS A GOOD CODE EXCEPT I GAVE MORE NUMBER OF POLYGONS
//AND NOW ROADS ARE CLASSIFIED AS VEGETATION!! 

// Load Sentinel-1 C-band SAR Ground Range collection (log scale, VV, descending)


var collectionVV = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VV');

// Load Sentinel-1 C-band SAR Ground Range collection (log scale, VH, descending)
var collectionVH = ee.ImageCollection('COPERNICUS/S1_GRD')
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
.filterMetadata('resolution_meters', 'equals' , 10)
.filterBounds(roi)
.select('VH');
print(collectionVH, 'Collection VH');
print(collectionVV, 'Collection VV');

//Filter by date
var SARVV = collectionVV.filterDate('2017-02-01', '2017-02-10').mosaic();
var SARVH = collectionVH.filterDate('2017-02-01', '2017-02-10').mosaic();

// Add the SAR images to "layers" in order to display them
Map.centerObject(roi, 7);
Map.addLayer(SARVV, {min:-15,max:0}, 'SAR VV', 0);
Map.addLayer(SARVH, {min:-25,max:0}, 'SAR VH', 0);

// Function to cloud mask from the pixel_qa band of Landsat 8 SR data.
//I have replaced the original function to mask cloud data with the code obtained in this link
//{https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR#bands}
//to mask cloud data for the sentinel-2 image
function maskL8sr(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000)
.select("B[0-9]*")
.copyProperties(image, ["system:time_start"]);
}

// Extract the images from the SENTINEL-2 collection
var collectionl8 = ee.ImageCollection('COPERNICUS/S2_SR')
.filterDate('2019-01-01', '2019-01-30')
// Pre-filter to get less cloudy granules.
.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',20))
.filterBounds(roi)
.map(maskL8sr);
print(collectionl8, 'Landsat');

//Calculate NDVI and create an image that contains all Landsat 8 bands and NDVI
var comp = collectionl8.mean();
var ndvi = comp.normalizedDifference(['B5', 'B4']).rename('NDVI');
var composite = ee.Image.cat(comp,ndvi);

// Add images to layers in order to display them
Map.centerObject(roi, 7);
Map.addLayer(composite, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.2}, 'Optical');

//NOT RUN FROM HERE ONWARDS
//NOT RUN FROM HERE ONWARDS
//NOT RUN FROM HERE ONWARDS





//Apply filter to reduce speckle
var SMOOTHING_RADIUS = 50;
var SARVV_filtered = SARVV.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters');
var SARVH_filtered = SARVH.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters');

//Display the SAR filtered images
Map.addLayer(SARVV_filtered, {min:-15,max:0}, 'SAR VV Filtered',0);
Map.addLayer(SARVH_filtered, {min:-25,max:0}, 'SAR VH Filtered',0);

//Merge Feature Collections
var newfc = open_water.merge(barren).merge(vegetation).merge(urban).merge(roads);

//Define the SAR bands to train your data
var final = ee.Image.cat(SARVV_filtered,SARVH_filtered);
var bands = ['VH','VV'];
var training = final.select(bands).sampleRegions({
  collection: newfc,
  properties: ['landcover'],
  scale: 30 });
  
//Train the classifier
var classifier = ee.Classifier.smileCart().train(training, 'landcover', bands);

//Run the Classification
var classified = final.select(bands).classify(classifier);

//Display the Classification
Map.addLayer(classified, 
{min: 1, max: 5, palette: ['3017d6', 'd2c448', '33ff51', 'ff0000', '5a5c6e']},
'SAR Classification');

// OLDCreate a confusion matrix representing resubstitution accuracy.
//print('RF- SAR error matrix: ', classifier.confusionMatrix());
//print('RF- SAR accuracy: ', classifier.confusionMatrix().accuracy());

//Repeat for Landsat. In my case l8 is Sentinel-2
//Define the Landsat bands to train your data
var bandsl8 = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7','NDVI' ];
var trainingl8 = composite.select(bandsl8).sampleRegions({
  collection: newfc,
  properties: ['landcover'],
  scale: 30
});

//Train the classifier
var classifierl8 = ee.Classifier.smileCart().train(trainingl8, 'landcover', bandsl8);

//Run the Classification
var classifiedl8 = composite.select(bandsl8).classify(classifierl8);

//Display the Classification
Map.addLayer(classifiedl8, 
{min: 1, max: 5, palette: ['3017d6', 'd2c448', '33ff51', 'ff0000', '5a5c6e']},
'Optical Classification');

// OLDCreate a confusion matrix representing resubstitution accuracy.
//print('RF-L8 error matrix: ', classifierl8.confusionMatrix());
//print('RF-L8 accuracy: ', classifierl8.confusionMatrix().accuracy());

//Define both optical and SAR to train your data
var opt_sar = ee.Image.cat(composite, SARVV_filtered,SARVH_filtered);
var bands_opt_sar = ['VH','VV','B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7','NDVI'];
var training_opt_sar = opt_sar.select(bands_opt_sar).sampleRegions({
  collection: newfc,
  properties: ['landcover'],
  scale: 30 });

//Train the classifier
var classifier_opt_sar = ee.Classifier.smileCart().train(training_opt_sar, 'landcover', bands_opt_sar);


//Run the Classification
var classifiedboth = opt_sar.select(bands_opt_sar).classify(classifier_opt_sar);
var demClip = classifiedboth.clip(table2);


//NEW ACCURACY ASSESSMENT

//Merge into one FeatureCollection
var valNames = Vopenwater.merge(Vbarren).merge(Vroads).merge(Vveg).merge(Vurban);


var validation = classifiedboth.sampleRegions({
  collection: valNames,
  properties: ['landcover'],
  scale: 10,
});
print(validation);


//Compare the landcover of your validation data against the classification result
var testAccuracy = validation.errorMatrix('landcover', 'classification');
//Print the error matrix to the console
print('Validation error matrix: ', testAccuracy);
//Print the overall accuracy to the console
print('Validation overall accuracy: ', testAccuracy.accuracy());
//Print the Kappa co-efficient to the console
print('Validation Kappa coefficient: ', testAccuracy.kappa());




//Display the Classification
var mask_o = composite.select(0).neq(1000)
var mask_r = SARVV_filtered.neq(1000)
var mask = mask_r.updateMask(mask_o)
Map.addLayer(demClip.updateMask(mask), 
{min: 1, max: 5, palette: ['3017d6', 'd2c448', '33ff51', 'ff0000', '5a5c6e']},
'Optical/SAR Classification');


//old
// Create a confusion matrix representing resubstitution accuracy.
//print('RF-Opt/SAR error matrix: ', classifier_opt_sar.confusionMatrix());
//print('RF-Opt/SAR accuracy: ', classifier_opt_sar.confusionMatrix().accuracy());

// Export the image, specifying scale and region.
 Export.image.toDrive({
   image: demClip,
  description: 'Optical_Radar',
   scale: 10,
    fileFormat: 'GeoTIFF',
    maxPixels: 8030040157504,
 });

 Export.image.toDrive({
   image: ndvi,
  description: 'ndvi',
   scale: 10,
    fileFormat: 'GeoTIFF',
    maxPixels: 70882735981,
 });

