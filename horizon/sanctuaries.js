'use strict';

// The 18 U.S. national marine sanctuaries, each at the representative point its Wikipedia article gives.
// A sanctuary is an area, so the distance is to that point, not to the nearest edge.
window.HorizonSanctuaries = [
  { id: 'american-samoa', name: 'National Marine Sanctuary of American Samoa', short: 'American Samoa sanctuary', lat: -14.365, lon: -170.765, link: 'https://americansamoa.noaa.gov/welcome.html' },
  { id: 'channel-islands', name: 'Channel Islands National Marine Sanctuary', short: 'Channel Islands sanctuary', lat: 34, lon: -120, link: 'https://channelislands.noaa.gov/' },
  { id: 'chumash-heritage', name: 'Chumash Heritage National Marine Sanctuary', short: 'Chumash Heritage sanctuary', lat: 34.483, lon: -121.017, link: 'https://sanctuaries.noaa.gov/chumash-heritage/' },
  { id: 'cordell-bank', name: 'Cordell Bank National Marine Sanctuary', short: 'Cordell Bank sanctuary', lat: 38.06659, lon: -123.36778, link: 'https://cordellbank.noaa.gov/' },
  { id: 'florida-keys', name: 'Florida Keys National Marine Sanctuary', short: 'Florida Keys sanctuary', lat: 24.68, lon: -81.24, link: 'https://floridakeys.noaa.gov/' },
  { id: 'flower-garden-banks', name: 'Flower Garden Banks National Marine Sanctuary', short: 'Flower Garden Banks sanctuary', lat: 27.917, lon: -93.717, link: 'https://flowergarden.noaa.gov/' },
  { id: 'grays-reef', name: "Gray's Reef National Marine Sanctuary", short: "Gray's Reef sanctuary", lat: 31.417, lon: -80.917, link: 'https://graysreef.noaa.gov/' },
  { id: 'greater-farallones', name: 'Greater Farallones National Marine Sanctuary', short: 'Greater Farallones sanctuary', lat: 37.8, lon: -123, link: 'https://farallones.noaa.gov/' },
  { id: 'hawaiian-islands-humpback-whale', name: 'Hawaiian Islands Humpback Whale National Marine Sanctuary', short: 'Humpback whale sanctuary', lat: 20.936, lon: -156.77, link: 'https://hawaiihumpbackwhale.noaa.gov/' },
  { id: 'lake-ontario', name: 'Lake Ontario National Marine Sanctuary', short: 'Lake Ontario sanctuary', lat: 43.517, lon: -76.733, link: 'https://sanctuaries.noaa.gov/news/press/lake-ontario/' },
  { id: 'mallows-bay-potomac-river', name: 'Mallows Bay–Potomac River National Marine Sanctuary', short: 'Mallows Bay sanctuary', lat: 38.472611, lon: -77.268583, link: 'https://sanctuaries.noaa.gov/mallows-potomac/' },
  { id: 'monitor', name: 'Monitor National Marine Sanctuary', short: 'Monitor sanctuary', lat: 35.00195, lon: -75.40633, link: 'https://monitor.noaa.gov/' },
  { id: 'monterey-bay', name: 'Monterey Bay National Marine Sanctuary', short: 'Monterey Bay sanctuary', lat: 36.8, lon: -122.5, link: 'https://montereybay.noaa.gov/' },
  { id: 'olympic-coast', name: 'Olympic Coast National Marine Sanctuary', short: 'Olympic Coast sanctuary', lat: 48, lon: -124.8, link: 'https://sanctuaries.noaa.gov/' },
  { id: 'papahanaumokuakea', name: 'Papahānaumokuākea National Marine Sanctuary', short: 'Papahānaumokuākea sanctuary', lat: 25.5, lon: -170.5, link: 'http://www.papahanaumokuakea.gov/' },
  { id: 'stellwagen-bank', name: 'Stellwagen Bank National Marine Sanctuary', short: 'Stellwagen Bank sanctuary', lat: 42.3333, lon: -70.25, link: 'https://stellwagen.noaa.gov/' },
  { id: 'thunder-bay', name: 'Thunder Bay National Marine Sanctuary', short: 'Thunder Bay sanctuary', lat: 45.0034, lon: -83.253, link: 'https://sanctuaries.noaa.gov/' },
  { id: 'wisconsin-shipwreck-coast', name: 'Wisconsin Shipwreck Coast National Marine Sanctuary', short: 'Wisconsin Shipwreck Coast sanctuary', lat: 44.0, lon: -87.6, link: 'https://sanctuaries.noaa.gov/wisconsin/' },
];
