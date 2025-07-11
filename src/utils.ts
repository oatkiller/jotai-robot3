import type { Getter } from 'jotai/vanilla';

export const isGetter = <T>(
	v: T | ((get: Getter) => T)
): v is (get: Getter) => T => typeof v === 'function';

/**
 * A special symbol that can be sent to `atomWithMachine` to force the underlying
 * Robot3 service to stop, reset and start from its initial state.
 */
export const RESTART: unique symbol = Symbol('RESTART');

export type Gettable<T> = T | ((get: Getter) => T);
