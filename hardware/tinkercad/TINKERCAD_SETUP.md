# Tinkercad Virtual Circuit Setup

## Purpose

Use Tinkercad as an optional, no-purchase visual demonstration of the proposed azimuth actuator. It contains a virtual Arduino Uno and one virtual Micro Servo. The GreenHex dashboard and Tinkercad run independently; the dashboard does not control the Tinkercad circuit directly.

## Create the virtual circuit

1. Open the Tinkercad Circuits link from the dashboard. If the link opens a design without editable parts, create a new **Circuit** in Tinkercad.
2. Add one **Arduino Uno R3** and one **Micro Servo** from the component library.
3. Connect servo signal to Arduino **D10**, servo VCC to **5V**, and servo GND to **GND**.
4. Open **Code**, select text mode, and paste the contents of `hardware/arduino/antenna_controller.ino`.
5. Start Simulation. The virtual servo starts at 35 degrees.

No physical Arduino, servo, breadboard, power supply, or jumper wires need to be purchased.

## Demo commands

The sketch accepts serial commands at 9600 baud:

- `STATUS` — report the current virtual angle.
- `SET AZIMUTH 120` — move the servo to a requested angle from 0 to 180 degrees.
- `RESET` — return to 35 degrees.
- `DEMO` — sweep through preset example angles.

If Tinkercad's serial monitor input is available, enter the target displayed by the dashboard manually. If serial input is unavailable or unreliable, run `DEMO` and narrate how the virtual movement corresponds to the dashboard recommendation. Do not claim a direct software connection.

## Live presentation sequence

1. Run **Compare Strategies** in the dashboard and explain the common demand profile.
2. Run **Run Autonomous Cycle** and point to the forecast, confidence indicator, decision, and reason.
3. Show the dashboard's virtual target, such as `SET AZIMUTH 80`.
4. Enter that target manually in Tinkercad, or use `DEMO` as the fallback.
5. Return to the dashboard and show the verification score.

Keep the dashboard as the primary demonstration; Tinkercad is an optional visual aid.
