"use client";

import { Dropdown } from '@heroui/react';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ThemeSwitcher() {
  const { setTheme, theme, resolvedTheme } = useTheme();

  if (!resolvedTheme) {
    return (
      <div className="h-[34px] w-[58px] animate-pulse rounded-full border border-default-200/80 bg-default-100/80" />
    );
  }

  const selectedTheme = (theme ?? 'system') as 'light' | 'dark' | 'system';
  const effectiveTheme = resolvedTheme as 'light' | 'dark';

  const triggerIcon =
    selectedTheme === 'system'
      ? <Laptop className="h-4 w-4" />
      : effectiveTheme === 'dark'
        ? <Moon className="h-4 w-4" />
        : <Sun className="h-4 w-4" />;

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label="Theme mode"
        className={cn(
          'inline-flex h-[34px] w-[58px] items-center justify-center rounded-full border border-default-200/80 transition-colors',
          effectiveTheme === 'dark' ? 'bg-default-900 text-default-100' : 'bg-default-100 text-foreground'
        )}
      >
        {triggerIcon}
      </Dropdown.Trigger>
      <Dropdown.Popover>
        <Dropdown.Menu
          aria-label="Theme"
          onAction={(key) => {
            if (key === 'light' || key === 'dark' || key === 'system') {
              setTheme(key);
            }
          }}
        >
          <Dropdown.Item id="system" textValue="System">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Laptop className="h-4 w-4" />
                <span>System</span>
              </div>
              {selectedTheme === 'system' && <Check className="h-4 w-4 text-primary" />}
            </div>
          </Dropdown.Item>
          <Dropdown.Item id="light" textValue="Light">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4" />
                <span>Light</span>
              </div>
              {selectedTheme === 'light' && <Check className="h-4 w-4 text-primary" />}
            </div>
          </Dropdown.Item>
          <Dropdown.Item id="dark" textValue="Dark">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Moon className="h-4 w-4" />
                <span>Dark</span>
              </div>
              {selectedTheme === 'dark' && <Check className="h-4 w-4 text-primary" />}
            </div>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
