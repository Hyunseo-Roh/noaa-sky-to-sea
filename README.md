# Sky to sea

A redesigned NOAA website and the Horizon app, built as static HTML, CSS and JavaScript. There is no build step.

- `index.html`: home, "Know your world, from sky to sea". One descent from the upper air to the whales: each chapter is a drawn plate (`css/descent.css`) on a ground that gets darker toward the sea. Tap a drawn object, or its line in the key on a phone, to open its card (`js/scene.js`).
- `ocean-and-sky.html`: Chapter 3, Ocean and sky
- `horizon/`: the Horizon app

Photo credits are in `credits.txt`.

The logo files in `images/logo/` are the final NOAA logo, approved Nov 4: the gull, raised, over a ribbon and a fine line on each side that rise from the foot of the circle and spread out under the wings. Each is placed by the height of NOAA's letters, with that height kept clear on every side. The full name shows only where it stays at 10 px or more. The favicon and the app icons are drawn from the small mark (`NOAA_Mark_Small_DeepOcean`) on white, a provisional choice; the white tile keeps the favicon visible in dark browser tabs.

## Horizon

Hold the phone up to the sky or the sea. Labels for NOAA's work sit on the places you are looking at. Tap one to preview it.

- **Live view:** the back camera fills the screen. The labels follow the phone's compass and tilt. The round button at the top right turns the camera off and goes back to the sample view.
- **Your location:** with location allowed, the top shows the town you are in (from the National Weather Service). Carysfort Reef sits in its real direction, at its real distance from you.
- **Weather for this sky:** the current National Weather Service forecast for where you stand (api.weather.gov).
- **Florida Keys sanctuary:** shows only when you are in the Keys.
- **Nearby:** NOAA's work around you, as cards. A NOAA photo of your horizon where there is one (Key Largo in the demo, humpbacks off the Channel Islands near Los Angeles). **Weather alerts** on top (when there are any). **Sky:** the forecast, sunrise and sunset, and the instruments measuring the weather near you: the three closest weather stations that reported in the last three hours, with their latest readings, and the weather radar that covers you. **Sea:** the nearest tide station, the nearest national marine sanctuary, and Carysfort Reef when you are in the Keys. Tap one for its preview and a link to its NOAA page.
- **What the view labels:** only the sky and the sea (the weather, the sun, tides, sanctuaries, and the reef when it is within 100 miles), each in its real direction. Weather stations and radar stay in Nearby, to keep the view calm.
- **Icons:** the brand's two modes, outline for tools and science (weather stations, radar) and solid for public information (forecast, alerts, sun, tides, places). Six come from the brand deck; sunrise, sunset, tides and the alert are drawn to match (`horizon/icons.js`).
- **Weather alerts:** warnings, watches and advisories in effect where you stand show as a red banner under your location, and at the top of Nearby. Tap one for what to expect, the area it covers, when it ends, and a link to the full alert on weather.gov.
- **Saved:** every preview has a Save button. Saved places are listed in the Saved tab, kept on the phone, with live readings for weather stations and live forecasts. Saving "Weather for this sky" keeps the forecast for the spot you are on.
- **Share:** every preview has a Share button that opens the phone's share sheet (or copies the link on a computer). The link opens the same preview in Horizon, from anywhere: `#station-KBUR`, `#radar-KVTX`, `#sanctuary-channel-islands`, `#forecast-34.168,-118.187`, `#carysfort-reef`.
- **Sunrise and sunset:** labels on the horizon in the real direction of the next sunrise and sunset, with the time where you stand. The preview gives the day length and links to NOAA's Solar Calculator, whose equations the app uses (`horizon/sun.js`).
- **Tides:** the nearest NOAA tide station within 100 miles, with the next high and low tide, in Nearby and as a label in the view. The preview links to the station's tide chart. Shared and saved tide stations show times in the station's own time zone.
- **Launch screen:** for 1.5 seconds when the app opens: the NOAA logo and the name Horizon over the sky, with the sun on the horizon in Sunlight. It fades into the start screen (tap to skip). Not shown from a shared link.
- **Start screen:** the website's chapter 3 drawing (Carysfort Lighthouse, a NOAA buoy, a tide station and a reef), with the three kinds of label Horizon shows. Then the NOAA logo, "See NOAA's work on your horizon" and what the app does, the two buttons ("Turn on the camera" and "Try the sample view first"; on a computer, the sample view only), and below them, small, how it works in three steps and what happens to the camera video. It shows each time the app opens, but not from a shared link.
- **Sunlight:** #F4B860 is the one warm accent: the sun (start screen, launch screen, sunrise and sunset icons), the buoy's yellow deck, the horizon line in the sample view and the point each label marks.
- **Nearby lines:** one set of long streamlines runs through the Sky, the Sea and the sources line, from the same NOAA forecasts as before (GFS winds at 250 hPa, Global RTOFS surface currents). The sky's lines hang from the bottom of the Sky and the sea's start at the top of the Sea, both at the screen's width, so every line crosses from one into the other. Lines end only at the screen's edge or where they run into another line (images/lines/nearby-sky.svg and nearby-sea.svg; jet-haze.svg and currents-deep.svg are the source data).
- **Demo location:** with location off, you stand on the ocean side of north Key Largo, Florida. Carysfort Reef is about 8 miles east.
- **Sample view:** a photo of Carysfort Lighthouse, taken from Key Largo. Drag to look around. The camera turns on when you tap "Turn on the camera".
- **Add to Home Screen:** the app opens full screen with its own icon.

The camera, compass and location only work on an `https://` address (or `localhost`). Phones ask for permission the first time.

## Tides API

`api/tides.js` runs on Vercel as a serverless function. It reads NOAA's tide stations and predictions (CO-OPS, api.tidesandcurrents.noaa.gov) so the app can get them from its own address:

- `/api/tides?lat=34.17&lon=-118.19`: the nearest station and its next high and low tides
- `/api/tides?station=9410840`: one station

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000/ for the website, or http://localhost:8000/horizon/ for the app. Tides need the Vercel function, so they show only on the deployed site (or with `vercel dev`).
