import { createStore } from 'jotai/vanilla';
import { atom } from 'jotai/vanilla';
import { atomWithMachine, RESTART } from '../src';
import { createMachine, state, transition } from 'robot3';

describe('atomWithMachine', () => {
	it('toggles state on events', () => {
		const toggleMachine = createMachine({
			off: state(transition('TOGGLE', 'on')),
			on: state(transition('TOGGLE', 'off'))
		});

		const machineAtom = atomWithMachine(() => toggleMachine);

		const store = createStore();
		store.sub(machineAtom, () => {});
		let current = store.get(machineAtom).current;
		expect(current).toBe('off');

		store.set(machineAtom, 'TOGGLE');
		current = store.get(machineAtom).current;
		expect(current).toBe('on');
	});

	it('supports RESTART symbol', () => {
		const countMachine = createMachine({
			idle: state(transition('PRESS', 'pressed')),
			pressed: state()
		});

		const countAtom = atomWithMachine(() => countMachine);
		const store = createStore();
		store.sub(countAtom, () => {});

		store.set(countAtom, 'PRESS');
		expect(store.get(countAtom).current).toBe('pressed');

		store.set(countAtom, RESTART);
		expect(store.get(countAtom).current).toBe('idle');
	});

	it('can start with custom initial state via getter', () => {
		const createToggleMachine = (initial: 'on' | 'off' = 'off') =>
			createMachine(initial, {
				off: state(transition('TOGGLE', 'on')),
				on: state(transition('TOGGLE', 'off'))
			});

		const initialStateAtom = atom<'on' | 'off'>('on');

		const machineAtom = atomWithMachine((get) =>
			createToggleMachine(get(initialStateAtom))
		);

		const store = createStore();
		store.sub(machineAtom, () => {});

		expect(store.get(machineAtom).current).toBe('on');

		// change initial state dynamically and restart
		store.set(initialStateAtom, 'off');
		store.set(machineAtom, RESTART);
		expect(store.get(machineAtom).current).toBe('off');
	});
});
