import {
  type Component,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import EnrichedTextInputNativeComponent, {
  Commands,
  type NativeProps,
  type OnChangeHtmlEvent,
  type OnChangeSelectionEvent,
  type OnChangeStateEvent,
  type OnChangeTextEvent,
  type OnLinkDetected,
  type OnMentionEvent,
  type OnMentionDetected,
  type OnMentionDetectedInternal,
  type OnRequestHtmlResultEvent,
  type MentionStyleProperties,
  type OnRequestAttributedStringResultEvent,
} from './EnrichedTextInputNativeComponent';
import type {
  ColorValue,
  HostInstance,
  MeasureInWindowOnSuccessCallback,
  MeasureLayoutOnSuccessCallback,
  MeasureOnSuccessCallback,
  NativeMethods,
  NativeSyntheticEvent,
  TextStyle,
  ViewProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { normalizeHtmlStyle } from './normalizeHtmlStyle';

type NativeAttributedStringRun =
  OnRequestAttributedStringResultEvent['attributedString'][number];
export interface AttributedStringRun {
  text: string;
  attributes: Array<
    | {
        type: 'font';
        font: {
          familyName: string;
          fontName: string;
          pointSize: number;
          traits: string[];
        };
      }
    | {
        type: 'underlineStyle';
        /** see NSUnderlineStyle */
        underlineStyle?: number;
      }
  >;
}

function castAttributedStringRun(
  native: NativeAttributedStringRun
): AttributedStringRun {
  const expectedAttributeTypes = [
    'font',
    'underlineStyle',
  ] as const satisfies (keyof NativeAttributedStringRun['attributes'][number])[];
  return {
    text: native.text,
    attributes: native.attributes.map((attr) => {
      const type =
        attr.type as AttributedStringRun['attributes'][number]['type'];
      if (!expectedAttributeTypes.includes(type)) {
        throw new Error(
          `Malformed AttributedStringRun: unexpected attribute type "${attr.type}"`
        );
      }
      if (attr[type] === undefined) {
        throw new Error(
          `Malformed AttributedStringRun: missing attribute data for type "${attr.type}"`
        );
      }
      return {
        type,
        [type]: attr[type]!,
      } as unknown as AttributedStringRun['attributes'][number];
    }),
  };
}

export interface EnrichedTextInputInstance extends NativeMethods {
  // General commands
  focus: () => void;
  blur: () => void;
  setValue: (value: string) => void;
  setAttributedString: (attributedString: AttributedStringRun[]) => void;
  setSelection: (start: number, end: number) => void;
  getAttributedString: () => Promise<AttributedStringRun[]>;
  getHTML: () => Promise<string>;

  // Text formatting commands
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikeThrough: () => void;
  toggleInlineCode: () => void;
  toggleH1: () => void;
  toggleH2: () => void;
  toggleH3: () => void;
  toggleH4: () => void;
  toggleH5: () => void;
  toggleH6: () => void;
  toggleCodeBlock: () => void;
  toggleBlockQuote: () => void;
  toggleOrderedList: () => void;
  toggleUnorderedList: () => void;
  setFont: (fontName: string) => void;
  setLink: (start: number, end: number, text: string, url: string) => void;
  setImage: (src: string, width: number, height: number) => void;
  startMention: (indicator: string) => void;
  setMention: (
    indicator: string,
    text: string,
    attributes?: Record<string, string>
  ) => void;
}

export interface OnChangeMentionEvent {
  indicator: string;
  text: string;
}

type HeadingStyle = {
  fontSize?: number;
  bold?: boolean;
};

export interface HtmlStyle {
  h1?: HeadingStyle;
  h2?: HeadingStyle;
  h3?: HeadingStyle;
  h4?: HeadingStyle;
  h5?: HeadingStyle;
  h6?: HeadingStyle;
  blockquote?: {
    borderColor?: ColorValue;
    borderWidth?: number;
    gapWidth?: number;
    color?: ColorValue;
  };
  codeblock?: {
    color?: ColorValue;
    borderRadius?: number;
    backgroundColor?: ColorValue;
  };
  code?: {
    color?: ColorValue;
    backgroundColor?: ColorValue;
  };
  a?: {
    color?: ColorValue;
    textDecorationLine?: 'underline' | 'none';
  };
  mention?: Record<string, MentionStyleProperties> | MentionStyleProperties;
  ol?: {
    gapWidth?: number;
    marginLeft?: number;
    markerFontWeight?: TextStyle['fontWeight'];
    markerColor?: ColorValue;
  };
  ul?: {
    bulletColor?: ColorValue;
    bulletSize?: number;
    marginLeft?: number;
    gapWidth?: number;
  };
}

export interface EnrichedTextInputProps extends Omit<ViewProps, 'children'> {
  ref?: Ref<EnrichedTextInputInstance | null>;
  autoFocus?: boolean;
  editable?: boolean;
  mentionIndicators?: string[];
  defaultValue?: string;
  placeholder?: string;
  placeholderTextColor?: ColorValue;
  cursorColor?: ColorValue;
  selectionColor?: ColorValue;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  htmlStyle?: HtmlStyle;
  style?: StyleProp<ViewStyle | TextStyle>;
  scrollEnabled?: boolean;
  allowsEditingTextAttributes?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onChangeText?: (e: NativeSyntheticEvent<OnChangeTextEvent>) => void;
  onChangeHtml?: (e: NativeSyntheticEvent<OnChangeHtmlEvent>) => void;
  onChangeState?: (e: NativeSyntheticEvent<OnChangeStateEvent>) => void;
  onLinkDetected?: (e: OnLinkDetected) => void;
  onMentionDetected?: (e: OnMentionDetected) => void;
  onStartMention?: (indicator: string) => void;
  onChangeMention?: (e: OnChangeMentionEvent) => void;
  onEndMention?: (indicator: string) => void;
  onChangeSelection?: (e: NativeSyntheticEvent<OnChangeSelectionEvent>) => void;
  /**
   * If true, Android will use experimental synchronous events.
   * This will prevent from input flickering when updating component size.
   * However, this is an experimental feature, which has not been thoroughly tested.
   * We may decide to enable it by default in a future release.
   * Disabled by default.
   */
  androidExperimentalSynchronousEvents?: boolean;
}

const nullthrows = <T,>(value: T | null | undefined): T => {
  if (value == null) {
    throw new Error('Unexpected null or undefined value');
  }

  return value;
};

const warnAboutMissconfiguredMentions = (indicator: string) => {
  console.warn(
    `Looks like you are trying to set a "${indicator}" but it's not in the mentionIndicators prop`
  );
};

type ComponentType = (Component<NativeProps, {}, any> & NativeMethods) | null;

type PendingRequest<Success> = {
  resolve: (value: Success) => void;
  reject: (error: Error) => void;
};

/** Manages asynchronous requests to native component */
function useRequests<Success, Result>(opts: {
  performRequest: (requestId: number) => void;
  extractRequestId: (result: Result) => number;
  resolveUsingResult: (
    e: Result,
    callbacks: {
      resolve: (value: Success) => void;
      reject: (reason: Error) => void;
    }
  ) => void;
}) {
  const nextRequestId = useRef(1);
  const pendingRequests = useRef(new Map<number, PendingRequest<Success>>());

  // We never want to trigger a render based on changes to params - wrap
  // everything in a ref and use useCallback to get stable functions.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const pending = pendingRequests.current;
    return () => {
      pending.forEach(({ reject }) => {
        reject(new Error('Component unmounted'));
      });
      pending.clear();
    };
  }, []);

  const request = useCallback(() => {
    return new Promise<Success>((resolve, reject) => {
      const requestId = nextRequestId.current++;
      pendingRequests.current.set(requestId, { resolve, reject });
      optsRef.current.performRequest(requestId);
    });
  }, [optsRef]);

  const onResult = useCallback(
    (e: Result) => {
      const requestId = optsRef.current.extractRequestId(e);
      const pending = pendingRequests.current.get(requestId);
      if (!pending) return;
      optsRef.current.resolveUsingResult(e, pending);
      pendingRequests.current.delete(requestId);
    },
    [optsRef]
  );

  return { request, onResult };
}

export const EnrichedTextInput = ({
  ref,
  autoFocus,
  editable = true,
  mentionIndicators = ['@'],
  defaultValue,
  placeholder,
  placeholderTextColor,
  cursorColor,
  selectionColor,
  style,
  autoCapitalize = 'sentences',
  htmlStyle = {},
  onFocus,
  onBlur,
  onChangeText,
  onChangeHtml,
  onChangeState,
  onLinkDetected,
  onMentionDetected,
  onStartMention,
  onChangeMention,
  onEndMention,
  onChangeSelection,
  androidExperimentalSynchronousEvents = false,
  scrollEnabled = true,
  ...rest
}: EnrichedTextInputProps) => {
  const nativeRef = useRef<ComponentType | null>(null);

  const htmlRequests = useRequests<
    string,
    NativeSyntheticEvent<OnRequestHtmlResultEvent>
  >({
    performRequest: (requestId) => {
      Commands.requestAttributedString(
        nullthrows(nativeRef.current),
        requestId
      );
    },
    extractRequestId: (e) => e.nativeEvent.requestId,
    resolveUsingResult: ({ nativeEvent: { html } }, { resolve, reject }) => {
      if (html === null || typeof html !== 'string') {
        reject(new Error('Failed to parse HTML'));
      } else {
        resolve(html);
      }
    },
  });
  const attributedStringRequests = useRequests<
    AttributedStringRun[],
    NativeSyntheticEvent<OnRequestAttributedStringResultEvent>
  >({
    performRequest: (requestId) => {
      Commands.requestAttributedString(
        nullthrows(nativeRef.current),
        requestId
      );
    },
    extractRequestId: (e) => e.nativeEvent.requestId,
    resolveUsingResult: (
      { nativeEvent: { attributedString } },
      { resolve }
    ) => {
      resolve(attributedString.map(castAttributedStringRun));
    },
  });

  const normalizedHtmlStyle = useMemo(
    () => normalizeHtmlStyle(htmlStyle, mentionIndicators),
    [htmlStyle, mentionIndicators]
  );

  useImperativeHandle(ref, () => ({
    measureInWindow: (callback: MeasureInWindowOnSuccessCallback) => {
      nullthrows(nativeRef.current).measureInWindow(callback);
    },
    measure: (callback: MeasureOnSuccessCallback) => {
      nullthrows(nativeRef.current).measure(callback);
    },
    measureLayout: (
      relativeToNativeComponentRef: HostInstance | number,
      onSuccess: MeasureLayoutOnSuccessCallback,
      onFail?: () => void
    ) => {
      nullthrows(nativeRef.current).measureLayout(
        relativeToNativeComponentRef,
        onSuccess,
        onFail
      );
    },
    setNativeProps: (nativeProps: object) => {
      nullthrows(nativeRef.current).setNativeProps(nativeProps);
    },
    focus: () => {
      Commands.focus(nullthrows(nativeRef.current));
    },
    blur: () => {
      Commands.blur(nullthrows(nativeRef.current));
    },
    setValue: (value: string) => {
      Commands.setValue(nullthrows(nativeRef.current), value);
    },
    setAttributedString: (attributedString: AttributedStringRun[]) => {
      Commands.setAttributedString(
        nullthrows(nativeRef.current),
        attributedString
      );
    },
    getAttributedString: attributedStringRequests.request,
    getHTML: htmlRequests.request,
    toggleBold: () => {
      Commands.toggleBold(nullthrows(nativeRef.current));
    },
    toggleItalic: () => {
      Commands.toggleItalic(nullthrows(nativeRef.current));
    },
    toggleUnderline: () => {
      Commands.toggleUnderline(nullthrows(nativeRef.current));
    },
    toggleStrikeThrough: () => {
      Commands.toggleStrikeThrough(nullthrows(nativeRef.current));
    },
    toggleInlineCode: () => {
      Commands.toggleInlineCode(nullthrows(nativeRef.current));
    },
    toggleH1: () => {
      Commands.toggleH1(nullthrows(nativeRef.current));
    },
    toggleH2: () => {
      Commands.toggleH2(nullthrows(nativeRef.current));
    },
    toggleH3: () => {
      Commands.toggleH3(nullthrows(nativeRef.current));
    },
    toggleH4: () => {
      Commands.toggleH4(nullthrows(nativeRef.current));
    },
    toggleH5: () => {
      Commands.toggleH5(nullthrows(nativeRef.current));
    },
    toggleH6: () => {
      Commands.toggleH6(nullthrows(nativeRef.current));
    },
    toggleCodeBlock: () => {
      Commands.toggleCodeBlock(nullthrows(nativeRef.current));
    },
    toggleBlockQuote: () => {
      Commands.toggleBlockQuote(nullthrows(nativeRef.current));
    },
    toggleOrderedList: () => {
      Commands.toggleOrderedList(nullthrows(nativeRef.current));
    },
    toggleUnorderedList: () => {
      Commands.toggleUnorderedList(nullthrows(nativeRef.current));
    },
    setFont: (fontName: string) => {
      Commands.setFont(nullthrows(nativeRef.current), fontName);
    },
    setLink: (start: number, end: number, text: string, url: string) => {
      Commands.addLink(nullthrows(nativeRef.current), start, end, text, url);
    },
    setImage: (uri: string, width: number, height: number) => {
      Commands.addImage(nullthrows(nativeRef.current), uri, width, height);
    },
    setMention: (
      indicator: string,
      text: string,
      attributes?: Record<string, string>
    ) => {
      // Codegen does not support objects as Commands parameters, so we stringify attributes
      const parsedAttributes = JSON.stringify(attributes ?? {});

      Commands.addMention(
        nullthrows(nativeRef.current),
        indicator,
        text,
        parsedAttributes
      );
    },
    startMention: (indicator: string) => {
      if (!mentionIndicators?.includes(indicator)) {
        warnAboutMissconfiguredMentions(indicator);
      }

      Commands.startMention(nullthrows(nativeRef.current), indicator);
    },
    setSelection: (start: number, end: number) => {
      Commands.setSelection(nullthrows(nativeRef.current), start, end);
    },
  }));

  const handleMentionEvent = (e: NativeSyntheticEvent<OnMentionEvent>) => {
    const mentionText = e.nativeEvent.text;
    const mentionIndicator = e.nativeEvent.indicator;

    if (typeof mentionText === 'string') {
      if (mentionText === '') {
        onStartMention?.(mentionIndicator);
      } else {
        onChangeMention?.({ indicator: mentionIndicator, text: mentionText });
      }
    } else if (mentionText === null) {
      onEndMention?.(mentionIndicator);
    }
  };

  const handleLinkDetected = (e: NativeSyntheticEvent<OnLinkDetected>) => {
    const { text, url, start, end } = e.nativeEvent;
    onLinkDetected?.({ text, url, start, end });
  };

  const handleMentionDetected = (
    e: NativeSyntheticEvent<OnMentionDetectedInternal>
  ) => {
    const { text, indicator, payload } = e.nativeEvent;
    const attributes = JSON.parse(payload) as Record<string, string>;
    onMentionDetected?.({ text, indicator, attributes });
  };

  return (
    <EnrichedTextInputNativeComponent
      ref={nativeRef}
      mentionIndicators={mentionIndicators}
      editable={editable}
      autoFocus={autoFocus}
      defaultValue={defaultValue}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      cursorColor={cursorColor}
      selectionColor={selectionColor}
      style={style}
      autoCapitalize={autoCapitalize}
      htmlStyle={normalizedHtmlStyle}
      onInputFocus={onFocus}
      onInputBlur={onBlur}
      onChangeText={onChangeText}
      onChangeHtml={onChangeHtml}
      isOnChangeHtmlSet={onChangeHtml !== undefined}
      isOnChangeTextSet={onChangeText !== undefined}
      onChangeState={onChangeState}
      onLinkDetected={handleLinkDetected}
      onMentionDetected={handleMentionDetected}
      onMention={handleMentionEvent}
      onChangeSelection={onChangeSelection}
      onRequestAttributedStringResult={attributedStringRequests.onResult}
      onRequestHtmlResult={htmlRequests.onResult}
      androidExperimentalSynchronousEvents={
        androidExperimentalSynchronousEvents
      }
      scrollEnabled={scrollEnabled}
      {...rest}
    />
  );
};
