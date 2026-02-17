// ESP32-C3 XIAO Blocking Serial Logger
// Measure 10 samples over 1 second, send to sheets, wait for completion, repeat
// Minimal serial output to avoid issues
// Last Edited: 2026-02-15

#include <Arduino.h>
#include <WiFi.h>
#include <ESP_Google_Sheet_Client.h>

// WiFi credentials
#define WIFI_SSID ""
#define WIFI_PASSWORD ""

// Google Service Account credentials
#define PROJECT_ID ""
#define CLIENT_EMAIL ""
const char PRIVATE_KEY[] PROGMEM = "";
const char spreadsheetId[] = "";

void tokenStatusCallback(TokenInfo info){
    // Silent - no serial output
}

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\nESP32-C3 Serial Logger");
  Serial.println("10 samples/sec, send avg, wait, repeat\n");
  
  pinMode(A1, INPUT);
  
  // Connect WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {  // Reduced to 10 seconds max
    delay(500);
    Serial.print(".");
    attempts++;
    yield();  // Feed watchdog
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi OK");
    
    // Sync time
    configTime(0, 0, "pool.ntp.org");
    Serial.print("Time sync");
    int i = 0;
    while (time(nullptr) < 100000 && i++ < 20) {
      delay(500);
      Serial.print(".");
      yield();  // Feed watchdog
    }
    Serial.println(time(nullptr) > 100000 ? " OK" : " FAIL");
    
    // Init Google Sheets
    GSheet.setTokenCallback(tokenStatusCallback);
    GSheet.setPrerefreshSeconds(10 * 60);
    GSheet.begin(CLIENT_EMAIL, PROJECT_ID, PRIVATE_KEY);
    
    // Wait for token to be ready
    Serial.print("GSheet init");
    int tokenWait = 0;
    while (!GSheet.ready() && tokenWait < 60) {
      delay(1000);
      Serial.print(".");
      tokenWait++;
      yield();  // Feed watchdog
    }
    Serial.println(GSheet.ready() ? " READY" : " TIMEOUT");
    
    Serial.println("\n=== STARTING DATA COLLECTION ===\n");
    // After this point, NO MORE Serial.print to avoid blocking issues
  } else {
    Serial.println("\nWiFi FAILED - halting");
    while(1) delay(1000);
  }
}

void loop() {
  // Step 1: Collect 10 samples over 1 second
  double sum = 0;
  for (int i = 0; i < 10; i++) {
    int reading = analogRead(A1);
    sum += reading;
    
    // Temporary debug - remove after testing
    if (i == 0) {
      Serial.print("Reading: ");
      Serial.print(reading);
      Serial.print(" Avg will be: ");
    }
    
    delay(100);  // 100ms between samples = 1 second total
    yield();  // Feed watchdog
  }
  double avg = sum / 10.0;
  
  // Temporary debug
  Serial.println(avg);
  
  // Validate the average (should be 0-4095 for 12-bit ADC)
  if (avg < 0 || avg > 4095 || isnan(avg) || isinf(avg)) {
    // Bad data, skip this cycle
    Serial.println("BAD DATA");
    return;
  }
  
  // Step 2: Send to Google Sheets and WAIT for completion
  if (WiFi.status() == WL_CONNECTED && GSheet.ready()) {
    // Get timestamp
    time_t now = time(nullptr);
    struct tm t;
    char timestamp[32];
    if (localtime_r(&now, &t)) {
      strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", &t);
    } else {
      strcpy(timestamp, "no-time");
    }
    
    // Build JSON - use int instead of double to avoid precision issues
    int avgInt = (int)avg;  // Convert to integer
    
    FirebaseJson valueRange;
    valueRange.add("majorDimension", "ROWS");
    valueRange.set("values/[0]/[0]", timestamp);
    valueRange.set("values/[0]/[1]", avgInt);  // Use int instead of double
    valueRange.set("values/[0]/[2]", 10);  // Always 10 samples
    
    // Temporary debug
    Serial.print("Sending: ");
    Serial.print(timestamp);
    Serial.print(" | ");
    Serial.print(avgInt);
    Serial.println(" | 10");
    
    // Send and WAIT
    FirebaseJson response;
    bool success = GSheet.values.append(&response, spreadsheetId, "Sheet1!A1", &valueRange);
    
    // Check if it actually worked
    if (success) {
      Serial.println("SUCCESS");
    } else {
      Serial.println("FAILED");
    }
    
    // Clean up
    response.clear();
    valueRange.clear();
  }
  
  // Step 3: Start next collection cycle immediately
  yield();
}
