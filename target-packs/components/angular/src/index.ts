/*
 * obdx-angular: the premium Angular components for a bank's OBDX UI. Standalone components; add 'src/bx.css' to the
 * app's styles once (the same skin as the premium JET pack) and put styleClasses(style) on the app's root element.
 */
export { Button, IconButton } from './button';
export type { Chroming } from './button';
export { AmountInput, TextField, decimalsOf, formatAmount } from './text-field';
export { Dropdown } from './dropdown';
export { CheckboxGroup, RadioGroup } from './choices';
export { DatePicker } from './date-picker';
export { Dialog } from './dialog';
export { Toast } from './toast';
export type { Message, Severity } from './toast';
export { Card } from './card';
export { Tabs } from './tabs';
export type { Tab } from './tabs';
export { DataTable } from './data-table';
export type { Column } from './data-table';
export { EFFECTS, play, reducedMotion } from './motion';
export type { Effect } from './motion';
export { styleClasses } from './style';
export type { ComponentStyle } from './style';
export type { Option } from './field';
export { Autocomplete, CURRENCIES, CurrencySelector, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, SearchField, TextArea, Toggle,
  fileSize } from './forms';
export type { DateRange } from './forms';

import { AmountInput, TextField } from './text-field';
import { Button, IconButton } from './button';
import { CheckboxGroup, RadioGroup } from './choices';
import { Card } from './card';
import { DataTable } from './data-table';
import { DatePicker } from './date-picker';
import { Dialog } from './dialog';
import { Dropdown } from './dropdown';
import { Tabs } from './tabs';
import { Toast } from './toast';
import { Autocomplete, CurrencySelector, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, SearchField, TextArea, Toggle } from './forms';

/** Every component, for a screen's imports: [...OBDX_COMPONENTS]. */
export const OBDX_COMPONENTS = [Button, IconButton, TextField, AmountInput, Dropdown, CheckboxGroup, RadioGroup, DatePicker, Dialog, Toast, Card, Tabs,
  DataTable, TextArea, PasswordField, NumberInput, CurrencySelector, MultiSelect, Toggle, DateRangePicker, SearchField, Autocomplete, FileUpload] as const;
