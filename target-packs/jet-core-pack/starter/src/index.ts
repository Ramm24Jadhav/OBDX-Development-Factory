/**
 * @license
 * Copyright (c) 2014, 2026, Oracle and/or its affiliates.
 * Licensed under The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
// injector:preactDebugImport
// endinjector
import './components/app';
import { applyStyle, saved } from './style';

// The design, motion, mode and brand of the factory's component style (style.ts)
applyStyle(document.documentElement, saved.defaults);
