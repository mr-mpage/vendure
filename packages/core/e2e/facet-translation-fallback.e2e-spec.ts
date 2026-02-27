import {
    CurrencyCode,
    FacetService,
    FacetValueService,
    LanguageCode,
    RequestContextService,
} from '@vendure/core';
import { createTestEnvironment, E2E_DEFAULT_CHANNEL_TOKEN } from '@vendure/testing';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { initialData } from '../../../e2e-common/e2e-initial-data';
import { TEST_SETUP_TIMEOUT_MS, testConfig } from '../../../e2e-common/test-config';

import * as Codegen from './graphql/generated-e2e-admin-types';
import { CREATE_CHANNEL, CREATE_FACET, UPDATE_GLOBAL_SETTINGS } from './graphql/shared-definitions';

/**
 * Tests the language fallback behaviour of FacetService.findByCode() and
 * FacetValueService.findAll() when a channel has a non-English defaultLanguageCode.
 *
 * Regression test for the bug where both methods passed only a single LanguageCode
 * to translateDeep() instead of a fallback array, ignoring ctx.channel.defaultLanguageCode.
 *
 * @see packages/core/src/service/services/facet.service.ts
 * @see packages/core/src/service/services/facet-value.service.ts
 */
describe('Facet translation language fallback', () => {
    const SECOND_CHANNEL_TOKEN = 'facet-translation-test-channel';
    const { server, adminClient } = createTestEnvironment(testConfig());

    /**
     * Set up:
     * - German (de) added to global available languages
     * - A second channel whose defaultLanguageCode is German (de)
     * - A facet with both EN and DE translations (but NO French translation)
     *
     * The tests then query via a RequestContext with languageCode = fr (French).
     * Expected: German is returned as the channel-default fallback.
     * Before fix: English would be returned (system DEFAULT_LANGUAGE_CODE fallback).
     */
    beforeAll(async () => {
        await server.init({
            initialData,
            productsCsvPath: path.join(__dirname, 'fixtures/e2e-products-minimal.csv'),
            customerCount: 0,
        });
        await adminClient.asSuperAdmin();

        // Add German to global available languages so the channel creation is valid
        await adminClient.query<
            Codegen.UpdateGlobalSettingsMutation,
            Codegen.UpdateGlobalSettingsMutationVariables
        >(UPDATE_GLOBAL_SETTINGS, {
            input: {
                availableLanguages: [LanguageCode.en, LanguageCode.de],
            },
        });

        // Create a channel whose default language is German
        await adminClient.query<Codegen.CreateChannelMutation, Codegen.CreateChannelMutationVariables>(
            CREATE_CHANNEL,
            {
                input: {
                    code: 'de-channel',
                    token: SECOND_CHANNEL_TOKEN,
                    defaultLanguageCode: LanguageCode.de,
                    currencyCode: CurrencyCode.EUR,
                    pricesIncludeTax: true,
                    defaultShippingZoneId: 'T_1',
                    defaultTaxZoneId: 'T_1',
                },
            },
        );

        adminClient.setChannelToken(SECOND_CHANNEL_TOKEN);

        // Create a facet with EN and DE translations, but no FR translation
        await adminClient.query<Codegen.CreateFacetMutation, Codegen.CreateFacetMutationVariables>(
            CREATE_FACET,
            {
                input: {
                    isPrivate: false,
                    code: 'brand',
                    translations: [
                        { languageCode: LanguageCode.en, name: 'Brand (EN)' },
                        { languageCode: LanguageCode.de, name: 'Marke (DE)' },
                    ],
                    values: [
                        {
                            code: 'acme',
                            translations: [
                                { languageCode: LanguageCode.en, name: 'Acme (EN)' },
                                { languageCode: LanguageCode.de, name: 'Acme (DE)' },
                            ],
                        },
                    ],
                },
            },
        );

        adminClient.setChannelToken(E2E_DEFAULT_CHANNEL_TOKEN);
    }, TEST_SETUP_TIMEOUT_MS);

    afterAll(async () => {
        await server.destroy();
    });

    describe('FacetService.findByCode() language fallback', () => {
        it('returns exact translation when requested language matches', async () => {
            const facetService = server.app.get(FacetService);
            const requestContextService = server.app.get(RequestContextService);

            const ctx = await requestContextService.create({
                apiType: 'admin',
                channelOrToken: SECOND_CHANNEL_TOKEN,
                languageCode: LanguageCode.de,
            });

            const facet = await facetService.findByCode(ctx, 'brand', LanguageCode.de);

            expect(facet).toBeDefined();
            expect(facet!.name).toBe('Marke (DE)');
        });

        it('falls back to channel defaultLanguageCode when requested language has no translation', async () => {
            const facetService = server.app.get(FacetService);
            const requestContextService = server.app.get(RequestContextService);

            // Context: French requested, but channel default is German
            const ctx = await requestContextService.create({
                apiType: 'admin',
                channelOrToken: SECOND_CHANNEL_TOKEN,
                languageCode: LanguageCode.fr,
            });

            const facet = await facetService.findByCode(ctx, 'brand', LanguageCode.fr);

            // Should fall back to German (channel default), not English (system default)
            expect(facet).toBeDefined();
            expect(facet!.name).toBe('Marke (DE)');
        });
    });

    describe('FacetValueService.findAll() language fallback', () => {
        it('returns exact translation when requested language matches', async () => {
            const facetValueService = server.app.get(FacetValueService);
            const requestContextService = server.app.get(RequestContextService);

            const ctx = await requestContextService.create({
                apiType: 'admin',
                channelOrToken: SECOND_CHANNEL_TOKEN,
                languageCode: LanguageCode.de,
            });

            const facetValues = await facetValueService.findAll(ctx, LanguageCode.de);

            expect(facetValues.length).toBeGreaterThan(0);
            const acme = facetValues.find(fv => fv.code === 'acme');
            expect(acme).toBeDefined();
            expect(acme!.name).toBe('Acme (DE)');
        });

        it('falls back to channel defaultLanguageCode when requested language has no translation', async () => {
            const facetValueService = server.app.get(FacetValueService);
            const requestContextService = server.app.get(RequestContextService);

            // Context: French requested, but channel default is German
            const ctx = await requestContextService.create({
                apiType: 'admin',
                channelOrToken: SECOND_CHANNEL_TOKEN,
                languageCode: LanguageCode.fr,
            });

            const facetValues = await facetValueService.findAll(ctx, LanguageCode.fr);

            // Should fall back to German (channel default), not English (system default)
            expect(facetValues.length).toBeGreaterThan(0);
            const acme = facetValues.find(fv => fv.code === 'acme');
            expect(acme).toBeDefined();
            expect(acme!.name).toBe('Acme (DE)');
        });
    });
});
