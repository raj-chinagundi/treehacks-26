// ESP32-C3 XIAO Blocking Serial Logger
// Measure 10 samples over 1 second, send to sheets, wait for completion, repeat
// Minimal serial output to avoid issues
// Last Edited: 2026-02-15

#include <Arduino.h>
#include <WiFi.h>
#include <ESP_Google_Sheet_Client.h>

// WiFi credentials
#define WIFI_SSID "Treehacks-2026"
#define WIFI_PASSWORD "treehacks2026!"

// Google Service Account credentials
#define PROJECT_ID "decent-lambda-487502-c7"
#define CLIENT_EMAIL "espdata@decent-lambda-487502-c7.iam.gserviceaccount.com"
const char PRIVATE_KEY[] PROGMEM = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDDxjOfRVfXRzOB\nf8eNGSceSw0aTwYNXN+3nERdFwEdQRgDdju0NxLAzGmyobpDTE4OGu373vz2KHAK\nxwjfgjm0Gzq+rDbq8QpAtzVgVX2v/W+ZF4Ibok+ClC1HkORED8xEBcusoU2RqGDs\nrZpz8isWBqGt5XMJk3WNd2PZGdpfFfw/8j/DDmNPvvzAM6q2oWbfj3qN2l1xDpEx\nd4mgMsV25M4lRnsE/lyf0vrkAqhfoFvsDe84YKVA9ySuFm/anCpZ+vW/bhVGVzWM\nPkEBJ3CYkw4Hd2XMpOJZ4VzuAbG2TR1n/oPh4Peit2vU1V/k6Q6fWpyF2Cyug7yQ\nW2QTxh0HAgMBAAECggEAAff1Pu3Ak16Y6v1w8T9GgGx6xj/zLKE5cqw0l8cKcNPd\nvPMsaISBQMUNbwlnSRP0WPn2WKkGXCdN8R3NPgoeMGxxq8cpijVASCRPeheB+woO\nXDi7SzHXoNWCmwye7vxFro1sXeEFWaiayOZ5/h56Rm9sosYC4R7FeNWxgFZdNsWK\nUE55RDYQQWtUlYC662twhDrTwbgSYq0h2XOui9wT9+IgUFLQvIVOOq07IvKG0H6r\nLK7pDJvXTYPkLdF8LKQVclC2Uv1Ysbde+qHTqY0M8x7pB2d3Mr7VTaioWUxyBPra\n1OctbQIyJJBPDobYM43limRxnmQWzKNnJRud5LYOKQKBgQDtJheGGoKg6l0Y+5vQ\ngf7GWEj47MEZoJMwXXKbK+30K+2cmKom3lXvSMCtBfvA8rbqLX/CCBSRfe+uJ5VF\nZY2O7QCGvbpmJIRr2ccEBXy3gm8LMita5q15FYiP8/BPSFBO9DzNjNJhIiCMkI/t\n3z83ICIzCTuFEBB4SriuPXhoPQKBgQDTViZA96pEWFXYkTGFdiWQus7dGGy+qvzs\nD6MJ0zNnQZsM287OYz4Vjaqn7CSFIobm7MABFxbkOv17TMDgmXkDYUM3klb2lfMm\nJrFk2TRvNgylFyT2OkBsknGo3cor4QXQfRONFRtZN8U/SDG9Othrx3s5YYhhaYpF\nPS6O3O1qkwKBgG56V20m/oH+jJ5t4NnTJaC7Ukt86DyLHObkMdbuMS2WJVzVljcD\nTx9pUjGI3w61Q9d2mNUItKRO+hC06gppU/gomx0qWCLrkjE4REmwULig8CBUH/R6\nEIifKn59kw8sThVqHMVZfEy5/FXfpt2XKjkBJE2IWI0VvcZ8cOrjQiu1AoGAT5/B\nwfCOIjn1/iaWNeaRuLnpfrvZHO1nZblugCEm2NyLAok+ndweZBiAF8yM5exgT1kb\n7k04vrzLDE2azgSE55UZsjJcuYM9nT4u0ARWESCYGwthTbQc2ctDL5CAv4+ElUzK\ntPki2LZ+hp04wEcPi2wZLUFmFO2ivvuSMxliCikCgYBYn1UJQetstpMddzAehWom\n3GCCdIWVyots+OCA6HJY7Rl7DGYDbg1roKALTGDTreKNwMCn9f8kuAJYB1a+2Dot\n8/0xwZclKZHTpA84/JqQeFhaHozJmfIghMg+4+R6kq0O1ZAR6EgAF3Ue0jGXWTmu\n6RS35kGw0CUC4ZY4C4TM7A==\n-----END PRIVATE KEY-----\n";

const char spreadsheetId[] = "1GzS2Ayq_pcz_CHOagVSpwCO643_ruCh46IKTFw28oZo";

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
