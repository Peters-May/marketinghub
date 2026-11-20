/* @ds-bundle: {"format":4,"namespace":"PetersMayDesignSystem_d426cb","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"e464cd286fc2","components/core/Button.jsx":"c3a0b8bb37b2","components/core/Card.jsx":"c14536c52830","components/feedback/Alert.jsx":"46518fbe01a9","components/forms/Checkbox.jsx":"ac09771fe10a","components/forms/Input.jsx":"896bcac8e213","components/forms/Select.jsx":"ed49d066b1be","components/navigation/Tabs.jsx":"d5064e83396a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PetersMayDesignSystem_d426cb = window.PetersMayDesignSystem_d426cb || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  neutral: {
    bg: 'var(--pm-neutral-100)',
    fg: 'var(--pm-neutral-700)',
    bd: 'var(--pm-neutral-200)'
  },
  blue: {
    bg: 'var(--accent-soft)',
    fg: 'var(--pm-blue-dark)',
    bd: '#cfe5f5'
  },
  danger: {
    bg: 'var(--status-danger-soft)',
    fg: 'var(--status-danger)',
    bd: '#e5c7c5'
  },
  success: {
    bg: 'var(--status-success-soft)',
    fg: 'var(--status-success)',
    bd: '#c7e0d0'
  },
  warning: {
    bg: 'var(--status-warning-soft)',
    fg: 'var(--status-warning)',
    bd: '#e7dcc2'
  },
  navy: {
    bg: '#e7ebef',
    fg: 'var(--pm-navy)',
    bd: '#c9d1da'
  },
  inverse: {
    bg: 'var(--pm-neutral-900)',
    fg: 'var(--pm-white)',
    bd: 'var(--pm-neutral-900)'
  }
};

/**
 * Compact status / category label. Soft tinted fills, never used as a button.
 */
function Badge({
  tone = 'neutral',
  solid = false,
  dot = false,
  children,
  style = {},
  ...rest
}) {
  const t = TONES[tone] || TONES.neutral;
  const composed = solid ? {
    background: t.fg,
    color: 'var(--pm-white)',
    border: `1px solid ${t.fg}`
  } : {
    background: t.bg,
    color: t.fg,
    border: `1px solid ${t.bd}`
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-caption)',
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: '0.02em',
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...composed,
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor',
      flexShrink: 0
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    padding: '8px 16px',
    fontSize: 'var(--fs-body-sm)',
    height: 36,
    gap: 8
  },
  md: {
    padding: '11px 22px',
    fontSize: 'var(--fs-body)',
    height: 44,
    gap: 9
  },
  lg: {
    padding: '15px 30px',
    fontSize: 'var(--fs-body-lg)',
    height: 54,
    gap: 10
  }
};
const VARIANTS = {
  primary: {
    background: 'var(--pm-blue)',
    color: 'var(--pm-white)',
    border: '1px solid var(--pm-blue)',
    hoverBg: 'var(--accent-hover)',
    hoverBorder: 'var(--accent-hover)',
    activeBg: 'var(--pm-blue-dark)'
  },
  danger: {
    background: 'var(--status-danger)',
    color: 'var(--pm-white)',
    border: '1px solid var(--status-danger)',
    hoverBg: '#961f19',
    hoverBorder: '#961f19',
    activeBg: '#7e1a15'
  },
  secondary: {
    background: 'var(--pm-white)',
    color: 'var(--pm-blue)',
    border: '1px solid var(--border-default)',
    hoverBg: 'var(--accent-soft)',
    hoverBorder: 'var(--pm-blue)',
    activeBg: '#d9ebf7'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-body)',
    border: '1px solid transparent',
    hoverBg: 'var(--pm-neutral-100)',
    hoverBorder: 'transparent',
    activeBg: 'var(--pm-neutral-200)'
  }
};

/**
 * Peters & May primary action button. Blue is the default brand action;
 * red maps to `danger`/high-emphasis. Solid, lightly rounded, no gradients.
 */
function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  iconLeft = null,
  iconRight = null,
  as = 'button',
  href,
  onClick,
  children,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const Tag = href ? 'a' : as;
  const composed = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    padding: s.padding,
    minHeight: s.height,
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'var(--font-sans)',
    fontSize: s.fontSize,
    fontWeight: 'var(--fw-semibold)',
    lineHeight: 1,
    letterSpacing: '0.01em',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radius-md)',
    background: disabled ? 'var(--pm-neutral-200)' : active ? v.activeBg : hover ? v.hoverBg : v.background,
    color: disabled ? 'var(--text-subtle)' : v.color,
    border: disabled ? '1px solid var(--pm-neutral-200)' : hover ? `1px solid ${v.hoverBorder}` : v.border,
    boxShadow: variant === 'primary' || variant === 'danger' ? disabled ? 'none' : 'var(--shadow-xs)' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transform: active && !disabled ? 'translateY(1px)' : 'none',
    transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
    ...style
  };
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    onClick: disabled ? undefined : onClick,
    "aria-disabled": disabled || undefined,
    disabled: Tag === 'button' ? disabled : undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: composed
  }, rest), iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flexShrink: 0
    }
  }, iconLeft), children, iconRight && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flexShrink: 0
    }
  }, iconRight));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Surface container. White, lightly rounded, soft cool-grey shadow.
 * `interactive` lifts on hover; `accent` adds a brand top stripe.
 */
function Card({
  interactive = false,
  accent = null,
  // null | 'blue' | 'red' | 'gold'
  padding = 'var(--space-5)',
  children,
  style = {},
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const stripe = accent ? {
    blue: 'var(--pm-blue)',
    navy: 'var(--pm-navy)'
  }[accent] : null;
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: interactive && hover ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
      transform: interactive && hover ? 'translateY(-3px)' : 'none',
      transition: 'box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)',
      overflow: 'hidden',
      ...style
    }
  }, rest), stripe && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      background: stripe
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding
    }
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  info: {
    bg: 'var(--status-info-soft)',
    bar: 'var(--pm-blue)',
    fg: 'var(--pm-blue-dark)'
  },
  success: {
    bg: 'var(--status-success-soft)',
    bar: 'var(--status-success)',
    fg: '#176b3a'
  },
  warning: {
    bg: 'var(--status-warning-soft)',
    bar: 'var(--status-warning)',
    fg: '#7a5a10'
  },
  danger: {
    bg: 'var(--status-danger-soft)',
    bar: 'var(--status-danger)',
    fg: 'var(--status-danger)'
  }
};
const ICONS = {
  info: 'M12 16v-5m0-3.5h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v4m0 3.5h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  danger: 'M12 9v4m0 3.5h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
};

/**
 * Inline message banner with a brand colour bar. Use for form feedback and page-level notices.
 */
function Alert({
  tone = 'info',
  title,
  children,
  onClose,
  style = {},
  ...rest
}) {
  const t = TONES[tone] || TONES.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      background: t.bg,
      borderLeft: `4px solid ${t.bar}`,
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-body)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: t.bar,
    strokeWidth: "2",
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: ICONS[tone],
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-semibold)',
      color: t.fg,
      marginBottom: children ? 2 : 0
    }
  }, title), children && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-body)'
    }
  }, children)), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Dismiss",
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--text-muted)',
      padding: 0,
      display: 'inline-flex',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6L6 18",
    strokeLinecap: "round"
  }))));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox with label. Brand-blue when checked, square with the system radius.
 */
function Checkbox({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled = false,
  id,
  style = {},
  ...rest
}) {
  const cbId = id || (label ? `cb-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: cbId,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-body)',
      color: disabled ? 'var(--text-subtle)' : 'var(--text-body)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    id: cbId,
    type: "checkbox",
    checked: checked,
    defaultChecked: defaultChecked,
    onChange: onChange,
    disabled: disabled,
    style: {
      position: 'absolute',
      opacity: 0,
      width: 20,
      height: 20,
      margin: 0,
      cursor: 'inherit'
    }
  }, rest)), /*#__PURE__*/React.createElement(CheckBox, {
    checked: checked ?? defaultChecked,
    disabled: disabled
  })), label);
}
function CheckBox({
  checked,
  disabled
}) {
  // Visual box reflects the *controlled* value when provided; for uncontrolled use the :has fallback below.
  return /*#__PURE__*/React.createElement("span", {
    "data-checked": checked ? 'true' : 'false',
    style: {
      width: 20,
      height: 20,
      borderRadius: 'var(--radius-xs)',
      border: `1.5px solid ${checked ? 'var(--pm-blue)' : 'var(--border-strong)'}`,
      background: disabled ? 'var(--pm-neutral-100)' : checked ? 'var(--pm-blue)' : 'var(--pm-white)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)'
    }
  }, checked && /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.5"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 13l4 4L19 7",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input with optional label, hint and error state. 44px tall, brand-blue focus ring.
 */
function Input({
  label,
  hint,
  error,
  id,
  type = 'text',
  iconLeft = null,
  disabled = false,
  required = false,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const borderColor = error ? 'var(--status-danger)' : focus ? 'var(--pm-blue)' : 'var(--border-default)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-strong)'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-danger)',
      marginLeft: 2
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: disabled ? 'var(--pm-neutral-100)' : 'var(--pm-white)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      padding: '0 14px',
      height: 44,
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)'
    }
  }, iconLeft && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: 'var(--text-subtle)',
      flexShrink: 0
    }
  }, iconLeft), /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    type: type,
    disabled: disabled,
    required: required,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-body)',
      color: 'var(--text-strong)',
      height: '100%',
      minWidth: 0
    }
  }, rest))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-caption)',
      color: error ? 'var(--status-danger)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Native select styled to match Input — 44px, brand-blue focus, chevron affordance.
 */
function Select({
  label,
  hint,
  error,
  id,
  options = [],
  placeholder,
  disabled = false,
  required = false,
  value,
  onChange,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const selectId = id || (label ? `sel-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const borderColor = error ? 'var(--status-danger)' : focus ? 'var(--pm-blue)' : 'var(--border-default)';
  const norm = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: selectId,
    style: {
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-strong)'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-danger)',
      marginLeft: 2
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: selectId,
    disabled: disabled,
    required: required,
    value: value,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      appearance: 'none',
      WebkitAppearance: 'none',
      width: '100%',
      height: 44,
      padding: '0 40px 0 14px',
      background: disabled ? 'var(--pm-neutral-100)' : 'var(--pm-white)',
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-body)',
      color: value || !placeholder ? 'var(--text-strong)' : 'var(--text-subtle)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)'
    }
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder), norm.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--text-muted)",
    strokeWidth: "2.5",
    style: {
      position: 'absolute',
      right: 14,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 9l6 6 6-6",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), (hint || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-caption)',
      color: error ? 'var(--status-danger)' : 'var(--text-muted)'
    }
  }, error || hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Underline tab bar. Active tab marked with a brand-blue underline.
 * Controlled via `value`/`onChange`, or uncontrolled with `defaultValue`.
 */
function Tabs({
  items = [],
  value,
  defaultValue,
  onChange,
  style = {},
  ...rest
}) {
  const norm = items.map(i => typeof i === 'string' ? {
    value: i,
    label: i
  } : i);
  const [internal, setInternal] = React.useState(defaultValue ?? norm[0]?.value);
  const active = value ?? internal;
  const select = v => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--border-subtle)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, rest), norm.map(t => {
    const on = t.value === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.value,
      role: "tab",
      "aria-selected": on,
      onClick: () => select(t.value),
      style: {
        position: 'relative',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '12px 16px',
        marginBottom: -1,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-body)',
        fontWeight: on ? 'var(--fw-semibold)' : 'var(--fw-regular)',
        color: on ? 'var(--pm-blue-dark)' : 'var(--text-muted)',
        borderBottom: `2px solid ${on ? 'var(--pm-blue)' : 'transparent'}`,
        transition: 'color var(--dur-fast) var(--ease-standard)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8
      }
    }, t.label, t.count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--fs-caption)',
        fontWeight: 'var(--fw-semibold)',
        background: on ? 'var(--accent-soft)' : 'var(--pm-neutral-100)',
        color: on ? 'var(--pm-blue-dark)' : 'var(--text-muted)',
        borderRadius: 'var(--radius-pill)',
        padding: '1px 8px'
      }
    }, t.count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
