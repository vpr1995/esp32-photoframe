#include "mdns_service.h"

#include "esp_log.h"
#include "mdns.h"

static const char *TAG = "mdns_service";

esp_err_t mdns_service_init(void)
{
    esp_err_t err = mdns_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "mDNS initialization failed: %s", esp_err_to_name(err));
        return err;
    }

    // Set hostname
    err = mdns_hostname_set("photoframe");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set mDNS hostname: %s", esp_err_to_name(err));
        return err;
    }

    // Set instance name
    err = mdns_instance_name_set("ESP32-S3 PhotoFrame");
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set mDNS instance name: %s", esp_err_to_name(err));
        return err;
    }

    // Add HTTP service
    err = mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add HTTP service: %s", esp_err_to_name(err));
        return err;
    }

    ESP_LOGI(TAG, "mDNS service started");
    ESP_LOGI(TAG, "Device accessible at: http://photoframe.local");

    return ESP_OK;
}
