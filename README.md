# Sky to sea

A redesigned NOAA website and the Horizon app, built as static HTML, CSS and JavaScript. There is no build step.

- `index.html`: home, "Know your world, from sky to sea"
- `ocean-and-sky.html`: Chapter 3, Ocean and sky
- `horizon/`: the Horizon app

Photo credits are in `credits.txt`.

## Horizon

Hold the phone up to the sky or the sea. Labels for NOAA's work sit on the places you are looking at. Tap one to preview it.

- **Live view:** the back camera fills the screen. The labels follow the phone's compass and tilt. The round button at the top right turns the camera off and goes back to the sample view.
- **Your location:** with location allowed, the top shows the town you are in (from the National Weather Service). Carysfort Reef sits in its real direction, at its real distance from you.
- **Weather for this sky:** the current National Weather Service forecast for where you stand (api.weather.gov).
- **Florida Keys sanctuary:** shows only when you are in the Keys.
- **Nearby:** NOAA's work around you, sorted by distance, live from the National Weather Service: the three closest weather stations that reported in the last three hours, with their latest readings, the weather radar that covers you, and the nearest national marine sanctuary. Each one also gets a label in the view, in its real direction, up to 150 miles away. Tap one for its preview and a link to its NOAA page.
- **Weather alerts:** warnings, watches and advisories in effect where you stand show as a red banner under your location, and at the top of Nearby. Tap one for what to expect, the area it covers, when it ends, and a link to the full alert on weather.gov.
- **Saved:** every preview has a Save button. Saved places are listed in the Saved tab, kept on the phone, with live readings for weather stations and live forecasts. Saving "Weather for this sky" keeps the forecast for the spot you are on.
- **Share:** every preview has a Share button that opens the phone's share sheet (or copies the link on a computer). The link opens the same preview in Horizon, from anywhere: `#station-KBUR`, `#radar-KVTX`, `#sanctuary-channel-islands`, `#forecast-34.168,-118.187`, `#carysfort-reef`.
- **Demo location:** with location off, you stand on the ocean side of north Key Largo, Florida. Carysfort Reef is about 8 miles east.
- **Sample view:** opening or refreshing the app starts on a photo of Carysfort Lighthouse, taken from Key Largo. Drag to look around. The camera turns on when you tap "Turn on the camera".
- **Add to Home Screen:** the app opens full screen with its own icon.

The camera, compass and location only work on an `https://` address (or `localhost`). Phones ask for permission the first time.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000/ for the website, or http://localhost:8000/horizon/ for the app.
