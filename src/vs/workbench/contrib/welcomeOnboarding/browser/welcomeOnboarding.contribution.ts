/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOnboardingService } from '../common/onboardingService.js';
import { DarkMatterOnboarding } from './darkMatterOnboarding.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ONBOARDING_STORAGE_KEY } from '../common/onboardingTypes.js';

import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

registerSingleton(IOnboardingService, DarkMatterOnboarding, InstantiationType.Delayed);

// ── Auto-show onboarding on first launch ──────────────────────────────
class DarkMatterOnboardingTrigger extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.darkMatterOnboardingTrigger';

	constructor(
		@IOnboardingService private readonly onboardingService: IOnboardingService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();

		// Only show on first launch (not yet dismissed)
		if (!this.storageService.get(ONBOARDING_STORAGE_KEY, StorageScope.PROFILE)) {
			// Persistent retry logic: attempt to show every 2 seconds until successful or dismissed
			this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
				const interval = setInterval(() => {
					// Stop if already dismissed or showing
					if (this.storageService.get(ONBOARDING_STORAGE_KEY, StorageScope.PROFILE) || (this.onboardingService as any).isShowing) {
						clearInterval(interval);
						return;
					}

					console.log('[Dark Matter] Attempting automatic onboarding trigger...');
					this.onboardingService.show();
				}, 2000);

				// Fallback safety: stop after 30 seconds
				setTimeout(() => clearInterval(interval), 30000);
			});
		}
	}
}

registerWorkbenchContribution2(
	DarkMatterOnboardingTrigger.ID,
	DarkMatterOnboardingTrigger,
	WorkbenchPhase.AfterRestored
);

// ── Command palette action ────────────────────────────────────────────
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.darkMatterOnboarding',
			title: localize2('darkMatterOnboarding', "Dark Matter: Setup Ollama"),
			category: Categories.Developer,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const onboardingService = accessor.get(IOnboardingService);
		onboardingService.show();
	}
});
