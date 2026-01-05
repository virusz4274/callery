"use client";

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Switch } from '@heroui/react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-[56px] h-[32px] rounded-full bg-default-200 animate-pulse" />
    );
  }

  const isDark = theme === 'dark';

  return (
    <Switch
      isSelected={isDark}
      onChange={(selected) => setTheme(selected ? 'dark' : 'light')}
      size="lg"
      aria-label="Toggle dark mode"
      className={cn(
        "w-[56px] h-[32px] rounded-full border border-default-200 transition-colors",
        isDark ? "bg-default-900" : "bg-default-200"
      )}
    >
      <Switch.Control>
        <Switch.Thumb>
          <Switch.Icon>
            {isDark ? (
              <Moon className="w-4 h-4 text-default-900 fill-current" />
            ) : (
              <Sun className="w-4 h-4 text-yellow-500 fill-current" />
            )}
          </Switch.Icon>
        </Switch.Thumb>
      </Switch.Control>
    </Switch>
  );
}
