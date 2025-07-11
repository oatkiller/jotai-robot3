/* eslint @typescript-eslint/no-explicit-any: off */

import type { Getter, WritableAtom } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';
import { interpret, type Service } from 'robot3';

import { RESTART, isGetter } from './utils.ts';

// Helper type for events that can be sent to the service. Robot3 accepts
// strings (transition name) or objects with a "type" field by default, so we
// fallback to `any` for maximum compatibility.
export type RobotEvent = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// Internal atoms are marked as private in development so they don't clutter
// React DevTools when using the official Jotai DevTools extension.
const markPrivate = (a: any) => {
	if (process.env.NODE_ENV !== 'production') {
		a.debugPrivate = true;
	}
};

// The public API – heavily inspired by jotai-xstate's `atomWithMachine`.
// ---------------------------------------------------------------------
//
// Example usage:
// const machine = createMachine({ ... }, () => ({ ...context }));
// const counterAtom = atomWithMachine(() => machine);
//
// Inside React:
// const [state, send] = useAtom(counterAtom);
//
// `state` is the live `service.machine` reference and will update whenever the
// machine transitions. Use `state.current` to read the current state value or
// `state.context` for extended state.
export function atomWithMachine(
	getMachine: any | ((get: Getter) => any),
	getInitialContext?:
		| Record<string, unknown>
		| ((get: Getter) => Record<string, unknown>)
): WritableAtom<any, [RobotEvent | typeof RESTART], void> {
	// Holds a reference to the currently running Robot service (or `null` before
	// lazy init / after restart).
	const cachedServiceAtom = atom<Service<any> | null>(null);
	markPrivate(cachedServiceAtom);

	// Stores the latest machine snapshot so that reads are synchronous.
	const cachedSnapshotAtom = atom<any | null>(null);
	markPrivate(cachedSnapshotAtom);

	// Responsible for creating the service, wiring up the onChange listener and
	// cleaning everything up on unmount.
	const snapshotAtom = atom(
		(get) => {
			const snapshot = get(cachedSnapshotAtom);
			if (snapshot) return snapshot;
			const svc = get(cachedServiceAtom);
			return svc?.machine;
		},
		(get, set, registerCleanup: (cleanup: () => void) => void) => {
			// If there's already a service running we just (re)register the listener.
			let service = get(cachedServiceAtom);
			if (!service) {
				// Lazily construct new service now that we have access to `set`.
				const safeGet: typeof get = (...args) => get(...args);
				const machine = isGetter(getMachine)
					? getMachine(safeGet)
					: getMachine;
				const initialCtx = isGetter(getInitialContext)
					? getInitialContext(safeGet)
					: getInitialContext;

				service = interpret(
					machine,
					(svc) => {
						set(cachedSnapshotAtom, svc.machine);
					},
					initialCtx as any
				);
				set(cachedServiceAtom, service);
				// Prime the snapshot with the initial machine value.
				set(cachedSnapshotAtom, service.machine);
			}

			// Register cleanup that stops the service when Atom is unmounted (e.g.
			// when no component is subscribed to it anymore).
			registerCleanup(() => {
				const current = get(cachedServiceAtom);
				if (current) {
					current.stop();
				}
				set(cachedServiceAtom, null);
				set(cachedSnapshotAtom, null);
			});
		}
	);

	// Ensure the snapshotAtom initializes the service when first mounted.
	snapshotAtom.onMount = (initialize) => {
		let unsub: (() => void) | undefined | false;

		initialize((cleanup) => {
			if (unsub === false) {
				cleanup();
			} else {
				unsub = cleanup;
			}
		});

		return () => {
			if (unsub) unsub();
			unsub = false;
		};
	};

	// Expose `[snapshot, send]` style API via a single writable atom similar to
	// jotai-xstate. Reading returns the latest snapshot, writing forwards events
	// to the underlying Robot service.
	const machineStateAtom = atom<any, [RobotEvent | typeof RESTART], void>(
		(get) => get(snapshotAtom),
		(get, set, event) => {
			const service = get(cachedServiceAtom);
			if (!service) return; // not mounted yet

			if (event === RESTART) {
				service.stop();
				set(cachedServiceAtom, null);
				set(cachedSnapshotAtom, null);
				// Trigger lazy re-initialisation on next read.
				set(snapshotAtom);
			} else {
				service.send(event as any);
				// No need to manually update snapshot – `onChange` callback will fire.
			}
		}
	);

	return machineStateAtom;
}
