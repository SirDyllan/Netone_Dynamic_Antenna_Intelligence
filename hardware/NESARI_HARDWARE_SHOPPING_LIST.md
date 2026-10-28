# Hardware Checklist — Tinkercad Only

## Purchase list

**None.** The team will present a software-first prototype and use virtual components in Tinkercad.

## Add inside Tinkercad Circuits

| Virtual part | Quantity | Purpose |
| --- | ---: | --- |
| Arduino Uno R3 | 1 | Runs the example actuator sketch |
| Micro Servo | 1 | Shows a bounded azimuth position |

Connect signal to D10, VCC to 5V, and GND to GND. Use `hardware/arduino/antenna_controller.ino`. The dashboard and Tinkercad are independent simulations; use the serial input manually if it is available, or run the sketch's `DEMO` sequence.

No physical Arduino, servo, wiring, breadboard, supply, or antenna mock-up is required.
