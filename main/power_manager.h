#ifndef POWER_MANAGER_H
#define POWER_MANAGER_H

#include <stdbool.h>

#include "esp_err.h"

esp_err_t power_manager_init(void);
void power_manager_enter_sleep(void);
void power_manager_enter_sleep_with_timer(uint32_t sleep_time_sec);
void power_manager_reset_sleep_timer(void);
bool power_manager_is_timer_wakeup(void);

#endif
