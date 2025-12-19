#include "power_manager.h"

#include "config.h"
#include "display_manager.h"
#include "driver/gpio.h"
#include "driver/rtc_io.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "http_server.h"

static const char *TAG = "power_manager";

static TaskHandle_t sleep_timer_task_handle = NULL;
static uint32_t sleep_countdown = AUTO_SLEEP_TIMEOUT_SEC;
static bool sleep_enabled = true;  // Enabled by default to prevent battery drain
static esp_sleep_wakeup_cause_t last_wakeup_cause = ESP_SLEEP_WAKEUP_UNDEFINED;

static void sleep_timer_task(void *arg)
{
    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));

        if (sleep_enabled && sleep_countdown > 0) {
            sleep_countdown--;

            // Log countdown every 30 seconds
            if (sleep_countdown % 30 == 0 && sleep_countdown > 0) {
                ESP_LOGI(TAG, "Auto-sleep countdown: %lu seconds remaining", sleep_countdown);
            }

            if (sleep_countdown == 0) {
                ESP_LOGI(TAG, "Sleep timeout reached, entering deep sleep");
                power_manager_enter_sleep();
            }
        }
    }
}

esp_err_t power_manager_init(void)
{
    last_wakeup_cause = esp_sleep_get_wakeup_cause();

    switch (last_wakeup_cause) {
    case ESP_SLEEP_WAKEUP_EXT0:
    case ESP_SLEEP_WAKEUP_EXT1:
        ESP_LOGI(TAG, "Wakeup caused by external signal (boot button)");
        break;
    case ESP_SLEEP_WAKEUP_TIMER:
        ESP_LOGI(TAG, "Wakeup caused by timer (auto-rotate)");
        // Disable auto-sleep for timer wakeup - device will go back to sleep immediately
        sleep_enabled = false;
        break;
    case ESP_SLEEP_WAKEUP_UNDEFINED:
    default:
        ESP_LOGI(TAG, "Not a deep sleep wakeup");
        break;
    }

    gpio_config_t io_conf = {.intr_type = GPIO_INTR_DISABLE,
                             .mode = GPIO_MODE_INPUT,
                             .pin_bit_mask = (1ULL << BOOT_BUTTON_GPIO),
                             .pull_down_en = GPIO_PULLDOWN_DISABLE,
                             .pull_up_en = GPIO_PULLUP_ENABLE};
    gpio_config(&io_conf);

    xTaskCreate(sleep_timer_task, "sleep_timer", 4096, NULL, 5, &sleep_timer_task_handle);

    ESP_LOGI(TAG, "Power manager initialized");
    return ESP_OK;
}

void power_manager_enter_sleep(void)
{
    ESP_LOGI(TAG, "Preparing to enter deep sleep mode");

    http_server_stop();

    // Check if auto-rotate is enabled
    if (display_manager_get_auto_rotate()) {
        // Use timer-based sleep for auto-rotate
        int rotate_interval = display_manager_get_rotate_interval();
        ESP_LOGI(TAG, "Auto-rotate enabled, setting timer wake-up for %d seconds", rotate_interval);
        esp_sleep_enable_timer_wakeup(rotate_interval * 1000000ULL);
    }

    // Always enable boot button wake-up
    esp_sleep_enable_ext0_wakeup(BOOT_BUTTON_GPIO, 0);

    ESP_LOGI(TAG, "Entering deep sleep now");
    vTaskDelay(pdMS_TO_TICKS(100));

    esp_deep_sleep_start();
}

void power_manager_enter_sleep_with_timer(uint32_t sleep_time_sec)
{
    ESP_LOGI(TAG, "Preparing to enter deep sleep with timer wake-up in %lu seconds",
             sleep_time_sec);

    http_server_stop();

    // Enable both timer and boot button wake-up
    esp_sleep_enable_timer_wakeup(sleep_time_sec * 1000000ULL);  // Convert to microseconds
    esp_sleep_enable_ext0_wakeup(BOOT_BUTTON_GPIO, 0);

    ESP_LOGI(TAG, "Entering deep sleep now");
    vTaskDelay(pdMS_TO_TICKS(100));

    esp_deep_sleep_start();
}

void power_manager_reset_sleep_timer(void)
{
    sleep_countdown = AUTO_SLEEP_TIMEOUT_SEC;
    sleep_enabled = true;  // Enable sleep timer when user interacts with web server
}

bool power_manager_is_timer_wakeup(void)
{
    return last_wakeup_cause == ESP_SLEEP_WAKEUP_TIMER;
}
