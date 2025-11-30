
"use client";

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Switch } from '@/components/ui/switch';
import { Sun, Moon } from 'lucide-react';

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
        <div className="flex items-center gap-2" style={{width: '93px', height: '28px'}}>
             <Sun className="h-5 w-5" />
        </div>
    );
  }

  const handleThemeChange = (checked: boolean) => {
    setTheme(checked ? 'dark' : 'light');
  };

  return (
    <div className="flex items-center gap-2">
      <Sun className="h-5 w-5" />
      <Switch
        checked={theme === 'dark'}
        onCheckedChange={handleThemeChange}
        aria-label="Toggle dark mode"
      />
      <Moon className="h-5 w-5" />
    </div>
  );
}
