/*
  GreenHex Team — NESARI 2026 virtual actuator demo
  Tinkercad components: Arduino Uno R3 + one Micro Servo only.
  Servo signal -> D10; VCC -> 5V; GND -> GND.

  This sketch is an independent virtual circuit. It does not receive
  commands directly from the dashboard or control a live antenna.
*/
#include <Servo.h>

const byte AZIMUTH_PIN = 10;
const int MIN_AZIMUTH = 0;
const int MAX_AZIMUTH = 180;
const int START_AZIMUTH = 35;
Servo azimuthServo;
int currentAzimuth = START_AZIMUTH;
String inputLine;

void moveTo(int angle) {
  currentAzimuth = constrain(angle, MIN_AZIMUTH, MAX_AZIMUTH);
  azimuthServo.write(currentAzimuth);
  Serial.print("AZIMUTH ");
  Serial.println(currentAzimuth);
}

void runDemo() {
  const int angles[] = {35, 60, 85, 110, 135, 160, 120, 35};
  for (unsigned int i = 0; i < sizeof(angles) / sizeof(angles[0]); i++) {
    moveTo(angles[i]);
    delay(500);
  }
}

void handleCommand(String command) {
  command.trim();
  command.toUpperCase();
  if (command == "STATUS") {
    Serial.print("AZIMUTH "); Serial.println(currentAzimuth);
  } else if (command == "RESET") {
    moveTo(START_AZIMUTH);
  } else if (command == "DEMO") {
    runDemo();
  } else if (command.startsWith("SET AZIMUTH ")) {
    int angle = command.substring(12).toInt();
    moveTo(angle);
  } else if (command.length() > 0) {
    Serial.println("Use STATUS, SET AZIMUTH <0-180>, RESET, or DEMO");
  }
}

void setup() {
  Serial.begin(9600);
  azimuthServo.attach(AZIMUTH_PIN);
  moveTo(START_AZIMUTH);
  Serial.println("GreenHex virtual actuator ready. Dashboard connection: manual demo only.");
}

void loop() {
  while (Serial.available() > 0) {
    char incoming = (char) Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      if (inputLine.length() > 0) { handleCommand(inputLine); inputLine = ""; }
    } else if (inputLine.length() < 48) {
      inputLine += incoming;
    }
  }
}
