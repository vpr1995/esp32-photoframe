.PHONY: format format-check format-diff help

# Find all C and H files in main/ directory only
# Exclude components/ (vendor library code), build/, managed_components/, etc.
C_FILES := $(shell find main -type f \( -name "*.c" -o -name "*.h" \) 2>/dev/null)

help:
	@echo "Available targets:"
	@echo "  format        - Format all C/H files with clang-format"
	@echo "  format-check  - Check if files need formatting (non-zero exit if changes needed)"
	@echo "  format-diff   - Show what would change without modifying files"

format:
	@echo "Formatting C/H files..."
	@clang-format -i $(C_FILES)
	@echo "Done! Formatted $(words $(C_FILES)) files."

format-check:
	@echo "Checking C/H files formatting..."
	@clang-format --dry-run --Werror $(C_FILES)
	@echo "All files are properly formatted!"

format-diff:
	@echo "Showing formatting differences..."
	@for file in $(C_FILES); do \
		echo "=== $$file ==="; \
		clang-format "$$file" | diff -u "$$file" - || true; \
	done
