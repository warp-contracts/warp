/* tslint:disable */
/* eslint-disable */
/**
* @param {Uint8Array} interaction
* @returns {Promise<Uint8Array | undefined>}
*/
export function handle(interaction: Uint8Array): Promise<Uint8Array | undefined>;
/**
* @param {Uint8Array} state
*/
export function initState(state: Uint8Array): void;
/**
* @returns {Uint8Array}
*/
export function currentState(): Uint8Array;
/**
* @returns {number}
*/
export function version(): number;
/**
* @returns {number}
*/
export function lang(): number;
