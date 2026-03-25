"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import labelsEs from "react-phone-number-input/locale/es.json";
import labelsEn from "react-phone-number-input/locale/en.json";
import { useLocale } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

type CountrySelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function CountrySelect({ value, onValueChange, placeholder, disabled }: CountrySelectProps) {
  const locale = useLocale();
  const labels = locale === "es" ? labelsEs : labelsEn;
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  const countryOptions = React.useMemo(() => {
    return Object.entries(labels as Record<string, string>)
      .filter(([code]) => code.length === 2)
      .map(([code, name]) => ({
        code: code.toUpperCase(),
        name: name as string
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [labels]);

  const selectedCountry = countryOptions.find(opt => opt.code === value) || countryOptions[0];

  return (
    <Popover
      open={isOpen}
      modal
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) setSearchValue("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            <FlagComponent
              country={selectedCountry?.code as RPNInput.Country}
              countryName={selectedCountry?.name}
            />
            <span>{selectedCountry?.name || placeholder}</span>
          </div>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput
            value={searchValue}
            onValueChange={(value) => {
              setSearchValue(value);
              setTimeout(() => {
                if (scrollAreaRef.current) {
                  const viewportElement = scrollAreaRef.current.querySelector(
                    "[data-radix-scroll-area-viewport]",
                  );
                  if (viewportElement) {
                    viewportElement.scrollTop = 0;
                  }
                }
              }, 0);
            }}
            placeholder={locale === "es" ? "Buscar país..." : "Search country..."}
          />
          <CommandList>
            <ScrollArea ref={scrollAreaRef} className="h-72">
              <CommandEmpty>{locale === "es" ? "No se encontró el país." : "No country found."}</CommandEmpty>
              <CommandGroup>
                {countryOptions.map(({ code, name }) => (
                  <CommandItem
                    key={code}
                    value={code}
                    onSelect={() => {
                      onValueChange(code);
                      setIsOpen(false);
                    }}
                    className="gap-2"
                  >
                    <FlagComponent
                      country={code as RPNInput.Country}
                      countryName={name}
                    />
                    <span className="flex-1 text-sm">{name}</span>
                    <CheckIcon
                      className={`ml-auto size-4 ${code === value ? "opacity-100" : "opacity-0"}`}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const FlagComponent = ({ country, countryName }: RPNInput.FlagProps) => {
  const Flag = flags[country];

  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-foreground/20 [&_svg:not([class*='size-'])]:size-full">
      {Flag && <Flag title={countryName} />}
    </span>
  );
};
