# Sky to sea

A redesigned NOAA website and the Horizon app, built as static HTML, CSS and JavaScript. There is no build step.

- `index.html`: home, "Know your world, from sky to sea"
- `ocean-and-sky.html`: Chapter 3, Ocean and sky
- `horizon/`: the Horizon app

Photo credits are in `credits.txt`.

## Horizon

Hold the phone up to the sky or the sea. Labels for NOAA's work sit on the places you are looking at. Tap one to preview it.

- **Live view:** the back camera fills the screen. The labels follow the phone's compass and tilt.
- **Demo location:** you stand on the ocean side of north Key Largo, Florida. Carysfort Reef is placed by its real position, about 8 miles east.
- **Weather for this sky:** shows the current National Weather Service forecast for that spot (api.weather.gov).
- **Sample view:** without a camera (for example on a laptop), the app shows a photo of Carysfort Lighthouse. Drag to look around.
- **Add to Home Screen:** the app opens full screen with its own icon.

The camera and compass only work on an `https://` address (or `localhost`). Phones ask for permission the first time.

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000/ for the website, or http://localhost:8000/horizon/ for the app.
