// 声明全局变量，供测试使用
declare global {
  namespace jest {
    interface Mock<T = any, Y extends any[] = any[]> {
      mockImplementation(fn: (...args: Y) => T): this;
      mockResolvedValueOnce(value: T): this;
      mockRejectedValueOnce(reason: any): this;
      mockReturnValueOnce(value: T): this;
      mockReturnValue(value: any): this;
      mockClear(): void;
    }
    function clearAllMocks(): void;
    function fn<T = any>(): Mock<T>;
    function mock(path: string, factory?: any): void;
  }

  interface Window {
    Image: {
      new(): HTMLImageElement;
      new(width: number, height?: number): HTMLImageElement;
      prototype: HTMLImageElement;
    }
  }
  
  // 对fetch进行类型定义
  let fetch: jest.Mock;
  
  // 测试相关函数
  function describe(name: string, fn: () => void): void;
  function beforeEach(fn: () => void): void;
  function it(name: string, fn: () => void | Promise<void>): void;
  function expect<T>(value: T): {
    toEqual(expected: any): void;
    toBe(expected: any): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledWith(...args: any[]): void;
    objectContaining(expected: any): any;
  };
}

// 扩展React对象的类型定义
declare namespace React {
  interface SyntheticEvent<T> {
    target: EventTarget & T;
    currentTarget: EventTarget & T;
    preventDefault(): void;
    stopPropagation(): void;
    nativeEvent: Event;
  }
}

// 添加测试库类型
declare module '@testing-library/react-hooks' {
  export function renderHook<TProps, TResult>(
    callback: (props: TProps) => TResult,
    options?: any
  ): {
    result: { current: TResult };
    waitForNextUpdate(): Promise<void>;
    rerender(props?: TProps): void;
    unmount(): void;
  };
  
  export function act(callback: () => void | Promise<void>): Promise<void> | void;
}

export {}; 