# Flow Field Theremin

your hosting link e.g. <http://a4-firstname-lastname.glitch.me> — *(deploy to Glitch/Render/Heroku and paste the live link here before submitting)*

A generative particle system rendered on `<canvas>`, where thousands of particles drift through
an animated noise-based flow field. Moving your mouse (or finger) bends the field around the
cursor and simultaneously plays a continuous Web Audio synthesizer voice — horizontal position
controls pitch, vertical position controls filter brightness — turning the piece into a visual
theremin. Clicking/tapping triggers a burst of new particles plus a short plucked note.

## Goal

The goal was to combine two of the assignment's suggested technologies — Canvas generative art
and the Web Audio API — into a single cohesive, playable instrument rather than treating them as
separate demos. The visuals and the audio are driven by the exact same pointer input, so the
piece feels like one interactive system instead of an animation with sound bolted on.

## Controls (exposed parameters)

All parameters are live and update the animation/audio in real time:

1. **Particle Count** — how many particles are simulated
2. **Noise Scale** — the "zoom level" of the flow field (finer vs. broader swirls)
3. **Flow Speed** — how fast particles travel through the field
4. **Trail Fade** — how quickly old frames fade out (short trails vs. long streaks)
5. **Hue** — base color of the particles
6. **Master Volume** — overall synth volume
7. **Enable Audio** — toggle the synth on/off independently of volume

Plus a **Reset Particles** button and a **Show Instructions** button to re-open the help overlay.

## Challenges

- **Browser audio-start policy**: modern browsers block `AudioContext` from starting before a
  user gesture, so the instructions overlay doubles as the required "click to begin" gesture and
  only then is the `AudioContext` created.
- **Keeping audio pleasant, not chaotic**: raw pointer-to-frequency mapping sounded harsh, so the
  frequency and filter cutoff are smoothed with `setTargetAtTime` instead of being set instantly,
  and the pointer-to-pitch mapping uses an exponential (not linear) curve across the audible range
  so it feels more like a musical instrument.
- **Performance with thousands of particles**: avoided expensive per-particle Perlin noise
  libraries by writing a small custom 2D value-noise function, and particles are drawn with plain
  `fillRect` calls rather than `arc()` paths to keep frame time low even at 4000 particles.
- **Letting the pointer influence, not dominate, the field**: the cursor applies a soft swirling
  force within a radius rather than fully overriding particle velocity, so the underlying
  generative pattern stays visible even while interacting.

## Instructions shown in the app

The app itself displays an overlay on load explaining the controls (move to steer/play, click for
a burst + pluck, use the panel to reshape the system) — that overlay can also be reopened anytime
via the "Show Instructions" button in the control panel.

## Running locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.
